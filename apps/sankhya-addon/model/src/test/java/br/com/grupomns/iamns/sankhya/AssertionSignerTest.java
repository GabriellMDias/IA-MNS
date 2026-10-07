package br.com.grupomns.iamns.sankhya;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AssertionSignerTest {

    @TempDir
    Path directory;

    @Test
    void signsAnEs256AssertionBoundToTheNonce() throws Exception {
        KeyPair pair = keyPair();
        HostConfiguration configuration = configuration(pair);

        String token = AssertionSigner.sign(configuration, "42", "Maria", "maria@example.test",
                "nonce-value-0123456789", 1_800_000_000L);

        String[] parts = token.split("\\.");
        assertEquals(3, parts.length);
        JsonObject header = json(parts[0]);
        JsonObject claims = json(parts[1]);
        assertEquals("ES256", header.get("alg").getAsString());
        assertEquals("JWT", header.get("typ").getAsString());
        assertEquals("kid-1", header.get("kid").getAsString());
        assertEquals("sankhya-dev", claims.get("iss").getAsString());
        assertEquals("ia-mns-api", claims.get("aud").getAsString());
        assertEquals("42", claims.get("sub").getAsString());
        assertEquals("nonce-value-0123456789", claims.get("nonce").getAsString());
        assertEquals(1_800_000_000L, claims.get("iat").getAsLong());
        assertEquals(1_800_000_060L, claims.get("exp").getAsLong());
        assertEquals("Maria", claims.get("name").getAsString());
        assertFalse(claims.get("jti").getAsString().isEmpty());

        byte[] jose = Base64.getUrlDecoder().decode(parts[2]);
        assertEquals(64, jose.length);
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(pair.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(verifier.verify(toDer(jose)));
    }

    @Test
    void omitsOptionalClaimsAndUsesUniqueIds() throws Exception {
        HostConfiguration configuration = configuration(keyPair());
        String first = AssertionSigner.sign(configuration, "7", null, null, "nonce-value-0123456789", 1L);
        String second = AssertionSigner.sign(configuration, "7", null, null, "nonce-value-0123456789", 1L);
        JsonObject claims = json(first.split("\\.")[1]);
        assertFalse(claims.has("name"));
        assertFalse(claims.has("email"));
        assertFalse(claims.get("jti").getAsString().equals(json(second.split("\\.")[1]).get("jti").getAsString()));
    }

    @Test
    void convertsShortAndPaddedDerIntegers() throws Exception {
        byte[] r = new byte[32];
        r[31] = 1;
        byte[] s = new byte[32];
        Arrays.fill(s, (byte) 0xff);
        byte[] jose = new byte[64];
        System.arraycopy(r, 0, jose, 0, 32);
        System.arraycopy(s, 0, jose, 32, 32);
        assertArrayEquals(jose, AssertionSigner.derToJose(toDer(jose)));
    }

    @Test
    void rejectsMalformedSignaturesAndKeys() throws Exception {
        assertThrows(java.security.GeneralSecurityException.class,
                () -> AssertionSigner.derToJose(new byte[] {0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x05, 0x01}));
        File invalid = directory.resolve("invalid.pem").toFile();
        Files.write(invalid.toPath(), "not a key".getBytes(StandardCharsets.US_ASCII));
        HostFailure failure = assertThrows(HostFailure.class, () -> AssertionSigner.readPrivateKey(invalid));
        assertEquals(HostFailure.NOT_CONFIGURED, failure.code());
    }

    private HostConfiguration configuration(KeyPair pair) throws Exception {
        Files.write(directory.resolve("key.pem"), pem(pair).getBytes(StandardCharsets.US_ASCII));
        Path properties = directory.resolve(HostConfiguration.FILE_NAME);
        Files.write(properties, String.join("\n",
                "iamns.origin=http://127.0.0.1:5173",
                "om.origin=http://localhost:8080",
                "sankhya.issuer=sankhya-dev",
                "iamns.audience=ia-mns-api",
                "signing.key.id=kid-1",
                "signing.key.file=key.pem").getBytes(StandardCharsets.US_ASCII));
        return HostConfiguration.load(properties.toFile());
    }

    static KeyPair keyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    static String pem(KeyPair pair) {
        return "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder().encodeToString(pair.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
    }

    private static JsonObject json(String part) {
        return new JsonParser().parse(new String(Base64.getUrlDecoder().decode(part), StandardCharsets.UTF_8))
                .getAsJsonObject();
    }

    private static byte[] toDer(byte[] jose) {
        byte[] r = integer(Arrays.copyOfRange(jose, 0, 32));
        byte[] s = integer(Arrays.copyOfRange(jose, 32, 64));
        byte[] der = new byte[6 + r.length + s.length];
        der[0] = 0x30;
        der[1] = (byte) (4 + r.length + s.length);
        der[2] = 0x02;
        der[3] = (byte) r.length;
        System.arraycopy(r, 0, der, 4, r.length);
        der[4 + r.length] = 0x02;
        der[5 + r.length] = (byte) s.length;
        System.arraycopy(s, 0, der, 6 + r.length, s.length);
        return der;
    }

    private static byte[] integer(byte[] unsigned) {
        return new BigInteger(1, unsigned).toByteArray();
    }
}

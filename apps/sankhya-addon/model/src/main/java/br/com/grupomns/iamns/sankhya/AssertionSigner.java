package br.com.grupomns.iamns.sankhya;

import com.google.gson.JsonObject;

import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.UUID;

/**
 * Signs the IA-MNS Sankhya assertion: a compact ES256 JWS bound to the IA-MNS
 * flow nonce, valid for at most 60 seconds (the IA-MNS verifier accepts up to
 * 120). See the assertion contract in docs/domains/identity.md.
 */
final class AssertionSigner {

    static final long LIFETIME_SECONDS = 60;
    private static final int P256_COORDINATE_BYTES = 32;
    private static final Base64.Encoder BASE64URL = Base64.getUrlEncoder().withoutPadding();

    private AssertionSigner() {
    }

    static String sign(HostConfiguration configuration, String subject, String name,
                       String email, String nonce, long nowSeconds) throws HostFailure {
        JsonObject header = new JsonObject();
        header.addProperty("alg", "ES256");
        header.addProperty("typ", "JWT");
        header.addProperty("kid", configuration.keyId);

        JsonObject claims = new JsonObject();
        claims.addProperty("iss", configuration.issuer);
        claims.addProperty("aud", configuration.audience);
        claims.addProperty("sub", subject);
        claims.addProperty("nonce", nonce);
        claims.addProperty("jti", UUID.randomUUID().toString());
        claims.addProperty("iat", nowSeconds);
        claims.addProperty("exp", nowSeconds + LIFETIME_SECONDS);
        if (name != null) {
            claims.addProperty("name", name);
        }
        if (email != null) {
            claims.addProperty("email", email);
        }

        String signingInput = encode(header.toString()) + "." + encode(claims.toString());
        try {
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(configuration.signingKey);
            signature.update(signingInput.getBytes(StandardCharsets.US_ASCII));
            byte[] jose = derToJose(signature.sign());
            return signingInput + "." + BASE64URL.encodeToString(jose);
        } catch (GeneralSecurityException e) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED, e);
        }
    }

    /** Reads a PKCS#8 PEM P-256 private key. */
    static PrivateKey readPrivateKey(File file) throws HostFailure {
        try {
            String pem = new String(Files.readAllBytes(file.toPath()), StandardCharsets.US_ASCII);
            String body = pem
                    .replace("-----BEGIN PRIVATE KEY-----", "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            PrivateKey key = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(der));
            if (!(key instanceof ECPrivateKey)
                    || ((ECPrivateKey) key).getParams().getCurve().getField().getFieldSize() != 256) {
                throw new HostFailure(HostFailure.NOT_CONFIGURED);
            }
            return key;
        } catch (IOException | IllegalArgumentException | GeneralSecurityException e) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED, e);
        }
    }

    /** Converts a DER ECDSA signature to the fixed-size R || S form required by JWS. */
    static byte[] derToJose(byte[] der) throws GeneralSecurityException {
        int offset = 0;
        if (der.length < 8 || der[offset++] != 0x30) {
            throw new GeneralSecurityException("Invalid ECDSA signature");
        }
        int sequenceLength = der[offset++] & 0xff;
        if (sequenceLength == 0x81) {
            sequenceLength = der[offset++] & 0xff;
        }
        if (sequenceLength != der.length - offset) {
            throw new GeneralSecurityException("Invalid ECDSA signature");
        }
        byte[] result = new byte[2 * P256_COORDINATE_BYTES];
        for (int part = 0; part < 2; part++) {
            if (der[offset++] != 0x02) {
                throw new GeneralSecurityException("Invalid ECDSA signature");
            }
            int length = der[offset++] & 0xff;
            if (length == 0 || offset + length > der.length) {
                throw new GeneralSecurityException("Invalid ECDSA signature");
            }
            byte[] integer = new byte[length];
            System.arraycopy(der, offset, integer, 0, length);
            offset += length;
            byte[] unsigned = new BigInteger(1, integer).toByteArray();
            int start = unsigned.length > P256_COORDINATE_BYTES ? unsigned.length - P256_COORDINATE_BYTES : 0;
            int size = unsigned.length - start;
            if (size > P256_COORDINATE_BYTES) {
                throw new GeneralSecurityException("Invalid ECDSA signature");
            }
            System.arraycopy(unsigned, start, result,
                    part * P256_COORDINATE_BYTES + P256_COORDINATE_BYTES - size, size);
        }
        return result;
    }

    private static String encode(String json) {
        return BASE64URL.encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}

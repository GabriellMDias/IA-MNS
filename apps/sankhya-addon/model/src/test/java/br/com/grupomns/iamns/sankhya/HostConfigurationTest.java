package br.com.grupomns.iamns.sankhya;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HostConfigurationTest {

    @TempDir
    Path directory;

    @Test
    void acceptsHttpsAndLoopbackHttpOrigins() throws Exception {
        assertEquals("https://om.example.test", HostConfiguration.origin("https://om.example.test"));
        assertEquals("https://ia.example.test:8443", HostConfiguration.origin("https://ia.example.test:8443"));
        assertEquals("http://localhost:8080", HostConfiguration.origin("http://localhost:8080"));
        assertEquals("http://127.0.0.1:5173", HostConfiguration.origin("http://127.0.0.1:5173"));
    }

    @Test
    void rejectsOriginsThatAreNotExactOrSecure() {
        String[] invalid = {
            "http://om.example.test", "https://om.example.test/", "https://om.example.test/path",
            "https://user@om.example.test", "ftp://localhost", "localhost:8080", "", "https://om.example.test#x"
        };
        for (String value : invalid) {
            HostFailure failure = assertThrows(HostFailure.class, () -> HostConfiguration.origin(value), value);
            assertEquals(HostFailure.NOT_CONFIGURED, failure.code());
        }
    }

    @Test
    void refusesIncompleteConfiguration() throws Exception {
        Files.write(directory.resolve("key.pem"),
                AssertionSignerTest.pem(AssertionSignerTest.keyPair()).getBytes(StandardCharsets.US_ASCII));
        Path properties = directory.resolve(HostConfiguration.FILE_NAME);
        Files.write(properties, String.join("\n",
                "iamns.origin=http://127.0.0.1:5173",
                "om.origin=http://localhost:8080",
                "iamns.audience=ia-mns-api",
                "signing.key.id=kid-1",
                "signing.key.file=key.pem").getBytes(StandardCharsets.US_ASCII));
        HostFailure failure = assertThrows(HostFailure.class, () -> HostConfiguration.load(properties.toFile()));
        assertEquals(HostFailure.NOT_CONFIGURED, failure.code());
    }

    @Test
    void refusesAMissingSigningKey() throws Exception {
        Path properties = directory.resolve(HostConfiguration.FILE_NAME);
        Files.write(properties, String.join("\n",
                "iamns.origin=http://127.0.0.1:5173",
                "om.origin=http://localhost:8080",
                "sankhya.issuer=sankhya-dev",
                "iamns.audience=ia-mns-api",
                "signing.key.id=kid-1",
                "signing.key.file=missing.pem").getBytes(StandardCharsets.US_ASCII));
        HostFailure failure = assertThrows(HostFailure.class, () -> HostConfiguration.load(properties.toFile()));
        assertEquals(HostFailure.NOT_CONFIGURED, failure.code());
    }
}

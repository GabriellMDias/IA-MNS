package br.com.grupomns.iamns.sankhya;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.security.PrivateKey;
import java.util.Properties;
import java.util.regex.Pattern;

/**
 * Server-side configuration of the IA-MNS host, kept in the WildFly configuration
 * directory (outside the Om database, the add-on package and this repository).
 * The signing key stays with the server operator; only its public key is given
 * to IA-MNS.
 */
public final class HostConfiguration {

    static final String FILE_NAME = "ia-mns-addon.properties";
    static final String FILE_PROPERTY = "ia-mns.addon.config";

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9._:-]{1,100}");
    private static final Pattern ISSUER = Pattern.compile("[\\x21-\\x7e]{1,200}");

    private static volatile Cached cached;

    final String iaMnsOrigin;
    final String omOrigin;
    final String issuer;
    final String audience;
    final String keyId;
    final PrivateKey signingKey;

    private HostConfiguration(String iaMnsOrigin, String omOrigin, String issuer,
                              String audience, String keyId, PrivateKey signingKey) {
        this.iaMnsOrigin = iaMnsOrigin;
        this.omOrigin = omOrigin;
        this.issuer = issuer;
        this.audience = audience;
        this.keyId = keyId;
        this.signingKey = signingKey;
    }

    /** Current configuration; reloaded when the file changes. */
    static HostConfiguration current() throws HostFailure {
        File file = locate();
        long modified = file.lastModified();
        Cached snapshot = cached;
        if (snapshot != null && snapshot.file.equals(file) && snapshot.modified == modified) {
            return snapshot.configuration;
        }
        HostConfiguration configuration = load(file);
        cached = new Cached(file, modified, configuration);
        return configuration;
    }

    static HostConfiguration load(File file) throws HostFailure {
        Properties properties = new Properties();
        try (InputStream input = new FileInputStream(file)) {
            properties.load(input);
        } catch (IOException e) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED, e);
        }
        String iaMnsOrigin = origin(properties.getProperty("iamns.origin"));
        String omOrigin = origin(properties.getProperty("om.origin"));
        String issuer = matching(properties.getProperty("sankhya.issuer"), ISSUER);
        String audience = matching(properties.getProperty("iamns.audience"), IDENTIFIER);
        String keyId = matching(properties.getProperty("signing.key.id"), IDENTIFIER);
        String keyPath = required(properties.getProperty("signing.key.file"));
        File keyFile = new File(keyPath);
        if (!keyFile.isAbsolute()) {
            keyFile = new File(file.getAbsoluteFile().getParentFile(), keyPath);
        }
        PrivateKey key = AssertionSigner.readPrivateKey(keyFile);
        return new HostConfiguration(iaMnsOrigin, omOrigin, issuer, audience, keyId, key);
    }

    private static File locate() throws HostFailure {
        String explicit = System.getProperty(FILE_PROPERTY);
        if (explicit != null && !explicit.trim().isEmpty()) {
            return existing(new File(explicit.trim()));
        }
        String directory = System.getProperty("jboss.server.config.dir");
        if (directory == null) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED);
        }
        return existing(new File(directory, FILE_NAME));
    }

    private static File existing(File file) throws HostFailure {
        if (!file.isFile()) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED);
        }
        return file;
    }

    private static String required(String value) throws HostFailure {
        if (value == null || value.trim().isEmpty()) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED);
        }
        return value.trim();
    }

    private static String matching(String value, Pattern pattern) throws HostFailure {
        String text = required(value);
        if (!pattern.matcher(text).matches()) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED);
        }
        return text;
    }

    /**
     * An exact origin: HTTPS, or HTTP only for a loopback development host, as
     * the IA-MNS API accepts for its own host origins.
     */
    static String origin(String value) throws HostFailure {
        String text = required(value);
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED, e);
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        boolean loopback = "localhost".equals(host) || "127.0.0.1".equals(host) || "[::1]".equals(host);
        boolean allowed = "https".equals(scheme) || ("http".equals(scheme) && loopback);
        String rebuilt = scheme + "://" + host + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
        if (!allowed || host == null || uri.getRawUserInfo() != null || !rebuilt.equals(text)) {
            throw new HostFailure(HostFailure.NOT_CONFIGURED);
        }
        return text;
    }

    private static final class Cached {
        final File file;
        final long modified;
        final HostConfiguration configuration;

        Cached(File file, long modified, HostConfiguration configuration) {
            this.file = file;
            this.modified = modified;
            this.configuration = configuration;
        }
    }
}

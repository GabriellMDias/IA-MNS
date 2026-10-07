package br.com.grupomns.iamns.sankhya;

/**
 * Expected refusal of the IA-MNS host. Its message is only a stable code that
 * the add-on screen forwards to IA-MNS as a bridge error; details stay in the
 * server log.
 */
public final class HostFailure extends Exception {

    private static final long serialVersionUID = 1L;

    /** No valid Om session user (signed out, expired, or the SUP user). */
    static final String NO_AUTHENTICATED_USER = "no_authenticated_user";
    /** The add-on configuration or signing key is missing or invalid. */
    static final String NOT_CONFIGURED = "host_not_configured";
    /** The request did not come from the add-on screen on the configured Om origin. */
    static final String FORBIDDEN_ORIGIN = "host_forbidden_origin";
    /** The request body is not a valid IA-MNS bridge request. */
    static final String INVALID_REQUEST = "host_invalid_request";

    private final String code;

    HostFailure(String code) {
        super(prefixed(code));
        this.code = code;
    }

    HostFailure(String code, Throwable cause) {
        super(prefixed(code), cause);
        this.code = code;
    }

    String code() {
        return code;
    }

    private static String prefixed(String code) {
        return "IA_MNS:" + code;
    }
}

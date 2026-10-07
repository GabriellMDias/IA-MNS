package br.com.grupomns.iamns.sankhya;

import br.com.sankhya.modelcore.auth.AuthenticationInfo;
import br.com.sankhya.studio.annotations.Controller;
import br.com.sankhya.ws.ServiceContext;

import javax.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * The add-on's only service. It never trusts identity supplied by the browser:
 * the user comes from the Om session that authenticated this request, and the
 * browser contributes only the IA-MNS flow nonce that the assertion is bound to.
 */
@Controller(serviceName = "IaMnsHostSP")
public class IaMnsHostController {

    private static final Logger LOG = Logger.getLogger(IaMnsHostController.class.getName());
    private static final Pattern NONCE = Pattern.compile("[A-Za-z0-9_-]{16,128}");
    private static final String EMBED_PATH = "/embed/sankhya";

    /**
     * Where the add-on screen frames IA-MNS and which origin it talks to. When the
     * Om was opened through another address (for example plain HTTP), it returns
     * only the configured Om origin so the screen can point to it; IA-MNS is never
     * framed there and no assertion is issued.
     */
    public Map<String, Object> configuracao() throws Exception {
        try {
            HttpServletRequest request = currentRequest();
            HostConfiguration configuration = HostConfiguration.current();
            requireHostCall(request);
            requireUser();
            Map<String, Object> response = new HashMap<>();
            if (!configuration.omOrigin.equals(request.getHeader("Origin"))) {
                LOG.info("IA-MNS host opened outside the configured Om origin");
                response.put("omOrigin", configuration.omOrigin);
                return response;
            }
            response.put("iaMnsOrigin", configuration.iaMnsOrigin);
            response.put("frameUrl", configuration.iaMnsOrigin + EMBED_PATH);
            return response;
        } catch (HostFailure failure) {
            throw refused("configuracao", failure);
        }
    }

    /** Mints the assertion for the signed-in Om user, bound to the IA-MNS nonce. */
    public Map<String, Object> assertion(AssertionRequest body) throws Exception {
        try {
            HttpServletRequest request = currentRequest();
            HostConfiguration configuration = HostConfiguration.current();
            requireSameOrigin(request, configuration);
            String nonce = body == null ? null : body.getNonce();
            if (nonce == null || !NONCE.matcher(nonce).matches()) {
                throw new HostFailure(HostFailure.INVALID_REQUEST);
            }
            AuthenticationInfo user = requireUser();
            String assertion = AssertionSigner.sign(
                    configuration,
                    subject(user),
                    text(user.getName(), 120),
                    text(user.getEmail(), 254),
                    nonce,
                    System.currentTimeMillis() / 1000);
            Map<String, Object> response = new HashMap<>();
            response.put("assertion", assertion);
            return response;
        } catch (HostFailure failure) {
            throw refused("assertion", failure);
        }
    }

    private static HttpServletRequest currentRequest() throws HostFailure {
        ServiceContext context = ServiceContext.getCurrent();
        HttpServletRequest request = context == null ? null : context.getHttpRequest();
        if (request == null) {
            throw new HostFailure(HostFailure.FORBIDDEN_ORIGIN);
        }
        return request;
    }

    /**
     * Only the add-on screen, loaded from the configured Om origin, may call this
     * service: it sends a custom header (impossible cross-origin without CORS), a
     * browser always sends Origin on POST, and fetch metadata marks a same-origin
     * call. This also refuses requests that did not arrive through the
     * configured (HTTPS, outside development) Om name.
     */
    private static void requireSameOrigin(HttpServletRequest request, HostConfiguration configuration)
            throws HostFailure {
        requireHostCall(request);
        if (!configuration.omOrigin.equals(request.getHeader("Origin"))) {
            throw new HostFailure(HostFailure.FORBIDDEN_ORIGIN);
        }
    }

    /** A same-origin POST from the add-on screen, whatever address the Om was opened by. */
    private static void requireHostCall(HttpServletRequest request) throws HostFailure {
        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (!"POST".equalsIgnoreCase(request.getMethod())
                || !"1".equals(request.getHeader("X-IA-MNS-Host"))
                || (fetchSite != null && !"same-origin".equals(fetchSite))) {
            throw new HostFailure(HostFailure.FORBIDDEN_ORIGIN);
        }
    }

    /**
     * The authenticated Om user. CODUSU 0 (the shared SUP account) is accepted by
     * the owner's 2026-10-06 decision, so it can be linked to an administrator.
     */
    private static AuthenticationInfo requireUser() throws HostFailure {
        AuthenticationInfo user = AuthenticationInfo.getCurrentOrNull();
        BigDecimal id = user == null ? null : user.getUserID();
        String reason = null;
        if (user == null || !user.isValid()) {
            reason = "no valid Om session";
        } else if (id == null || id.compareTo(BigDecimal.valueOf(9_999_999_999L)) > 0 || id.signum() < 0) {
            reason = "unusable CODUSU";
        }
        if (reason != null) {
            LOG.info("IA-MNS host found no person: " + reason);
            throw new HostFailure(HostFailure.NO_AUTHENTICATED_USER);
        }
        return user;
    }

    /** CODUSU as the canonical decimal string the IA-MNS verifier expects. */
    private static String subject(AuthenticationInfo user) throws HostFailure {
        try {
            return user.getUserID().toBigIntegerExact().toString();
        } catch (ArithmeticException e) {
            throw new HostFailure(HostFailure.NO_AUTHENTICATED_USER, e);
        }
    }

    private static String text(String value, int limit) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > limit ? trimmed.substring(0, limit) : trimmed;
    }

    private static HostFailure refused(String operation, HostFailure failure) {
        LOG.log(failure.getCause() == null ? Level.INFO : Level.WARNING,
                "IA-MNS host refused " + operation + ": " + failure.code(), failure.getCause());
        return failure;
    }
}

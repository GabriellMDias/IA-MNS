package br.com.grupomns.iamns.sankhya;

/** Body of IaMnsHostSP.assertion: the nonce of the pending IA-MNS flow. */
public class AssertionRequest {

    private String nonce;

    public AssertionRequest() {
    }

    public String getNonce() {
        return nonce;
    }

    public void setNonce(String nonce) {
        this.nonce = nonce;
    }
}

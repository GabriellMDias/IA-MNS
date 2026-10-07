/*
 * IA-MNS host screen (bridge protocol v1, docs/domains/identity.md).
 * It only frames the official IA-MNS frontend at /embed/sankhya and answers its
 * sign-in requests with an assertion minted on the server from the Om session.
 * It renders no IA-MNS interface and keeps no IA-MNS state.
 */
angular
    .module('IaMnsApp', ['snk'])
    .controller('IaMnsController', ['ServiceProxy', '$scope', '$window',
        function (ServiceProxy, $scope, $window) {
            var self = this;
            var SERVICE = 'ia-mns@IaMnsHostSP.';
            // The custom header cannot be sent cross-origin without CORS, and the
            // IA-MNS frame shows any failure itself, so the Om popup is skipped.
            var CALL = { ignorePopUpErrorMsgs: true, headers: { 'X-IA-MNS-Host': '1' } };
            var config = null;
            var frame = null;

            self.message = 'Abrindo o IA-MNS...';
            self.init = init;

            function init() {
                if (frame) {
                    return;
                }
                frame = document.getElementById('ia-mns-frame');
                $window.addEventListener('message', onMessage);
                ServiceProxy.callService(SERVICE + 'configuracao', {}, CALL).then(function (result) {
                    var body = responseBody(result);
                    var secureOrigin = value(body.omOrigin);
                    if (typeof secureOrigin === 'string') {
                        self.message = 'Para usar o IA-MNS, abra o Sankhya pelo endereço seguro: ' + secureOrigin;
                        return;
                    }
                    var origin = value(body.iaMnsOrigin);
                    var frameUrl = value(body.frameUrl);
                    if (typeof origin !== 'string' || typeof frameUrl !== 'string'
                        || frameUrl.indexOf(origin + '/') !== 0) {
                        return unavailable();
                    }
                    config = { origin: origin };
                    frame.src = frameUrl;
                    self.message = null;
                }, unavailable);
            }

            function unavailable() {
                self.message = 'O IA-MNS não está disponível neste ambiente do Sankhya. Fale com o administrador.';
            }

            // Answers only its own IA-MNS frame, from the configured IA-MNS origin.
            function onMessage(event) {
                if (!config || !frame || event.origin !== config.origin || event.source !== frame.contentWindow) {
                    return;
                }
                var data = event.data;
                if (!data || data.v !== 1 || data.type !== 'ia-mns:auth-request' || data.provider !== 'sankhya'
                    || typeof data.requestId !== 'string' || typeof data.nonce !== 'string') {
                    return;
                }
                var requestId = data.requestId;
                ServiceProxy.callService(SERVICE + 'assertion', { body: { nonce: data.nonce } }, CALL).then(function (result) {
                    var assertion = value(responseBody(result).assertion);
                    if (typeof assertion === 'string') {
                        reply({ v: 1, type: 'ia-mns:auth-response', requestId: requestId, assertion: assertion });
                    } else {
                        reply({ v: 1, type: 'ia-mns:auth-error', requestId: requestId, error: 'host_error' });
                    }
                }, function (failure) {
                    reply({ v: 1, type: 'ia-mns:auth-error', requestId: requestId, error: errorCode(failure) });
                });
            }

            function reply(message) {
                frame.contentWindow.postMessage(message, config.origin);
            }

            function errorCode(failure) {
                var text = failure && typeof failure.statusMessage === 'string' ? failure.statusMessage : '';
                var match = /IA_MNS:([a-z_]{3,40})/.exec(text);
                if (match) {
                    return match[1];
                }
                // Om status 3 means the Om session is no longer valid.
                return failure && String(failure.status) === '3' ? 'no_authenticated_user' : 'host_error';
            }

            // Add-on controllers return their value under responseBody.body.
            function responseBody(result) {
                var body = (result && result.responseBody) || {};
                return body.body && typeof body.body === 'object' ? body.body : body;
            }

            // Om service responses may wrap scalar values as { "$": value }.
            function value(field) {
                return field && typeof field === 'object' && '$' in field ? field.$ : field;
            }

            $scope.$on('$destroy', function () {
                $window.removeEventListener('message', onMessage);
            });
        }]);

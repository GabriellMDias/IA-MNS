# Sankhya Om Add-on

This application adapts and hosts IA-MNS inside Sankhya Om. It is an Add-on Studio project built with Gradle for the Om runtime (Java 8 on WildFly), kept in the IA-MNS repository but outside the pnpm workspace ([ADR-0026](../../docs/adr/0026-host-ia-mns-in-sankhya-om-through-an-in-repository-add-on.md)). Read the [local instructions](AGENTS.md) before changing it.

## Current state

The embedded integration works in the Sankhya development Om and was validated there on 2026-10-06 with a real signed-in Om user ([PJ-24](../../docs/project/implementation-plan.md#current-work)): the Om menu entry **IA-MNS** opens the official IA-MNS frontend inside the Om, the signed-in user enters IA-MNS without another sign-in, a first access provisions the Person and its Sankhya link, and later accesses reach the same Person and history. The direct-URL "Entrar com Sankhya" authorize page is not implemented yet. Nothing has been published to a production Om ([PJ-17](../../docs/project/implementation-plan.md#current-work), [PH-14](../../docs/project/human-actions.md#ph-14)).

## Responsibilities

| Application | Responsibility |
| --- | --- |
| `apps/web` | The only IA-MNS frontend, served to the direct URL and to the `/embed/pdt` and `/embed/sankhya` surfaces. |
| `apps/api` | IA-MNS backend and identity of record: verifies host proofs, provisions and links Persons, issues sessions and computes permissions. |
| `apps/sankhya-addon` | Integration with the Om: hosts the frontend and proves which Om user is signed in. |

The add-on is limited to:

- the menu screen `IaMns` (Om resource `ia-mns.IaMns`) that frames `/embed/sankhya`, so IA-MNS opens inside the Om without an IA-MNS sign-in;
- the answer to bridge protocol v1 from that frame;
- the service `IaMnsHostSP`, which reads the authenticated user from the server-side Om session and signs the short assertion of the [assertion contract](../../docs/domains/identity.md#sankhya-om-add-on-assertion-contract);
- later, the authorize page that the direct-URL "Entrar com Sankhya" flow redirects to.

It must not render IA-MNS screens, reimplement frontend behavior, or hold IA-MNS business rules, conversations, permissions, Persons, links or data. Provisioning at first access, linking and authorization happen in the API, so a person reaches the same Person, history and permissions from the direct URL, the Om or PDT Connect. The API trusts only the signed assertion, never an identity supplied by the browser.

## How it works

1. The Om opens `IaMns.xhtml5`. The screen calls `IaMnsHostSP.configuracao`, which returns the configured IA-MNS origin, and frames `<IA-MNS origin>/embed/sankhya` with `referrerpolicy="no-referrer"`, so the Om session parameter in the screen URL never reaches IA-MNS. When the Om was opened through an address other than the configured Om origin (in production, anything but its HTTPS name), the service returns only that origin and the screen asks the person to open the Om through it; IA-MNS is not framed and no assertion can be issued.
2. The IA-MNS frame starts a pending flow and asks its parent for a proof bound to the flow nonce. The screen answers only messages from its own frame and the configured origin.
3. The screen calls `IaMnsHostSP.assertion` with the nonce. The service accepts only POST requests from the configured Om origin carrying `X-IA-MNS-Host: 1` (and `Sec-Fetch-Site: same-origin` when sent), takes the CODUSU from `AuthenticationInfo` of the Om session, refuses a missing or invalid session, and returns an ES256 assertion valid for 60 seconds.
4. The screen posts the assertion to the frame; the IA-MNS API verifies it with the pinned public key, consumes it once, and signs the Person in. Failures reach the frame as bridge error codes (`no_authenticated_user`, `host_not_configured`, `host_forbidden_origin`, `host_invalid_request`, `host_error`), which IA-MNS shows without retrying.

The service and the screen use the Om's own session and service mechanisms (`ServiceProxy`, `mgeSession`); the SDK wraps request and response values in `body`. CODUSU 0 (SUP) is accepted by owner decision, so the shared SUP account can be consolidated into an administrator's Person ([identity](../../docs/domains/identity.md#sankhya-om-add-on-assertion-contract)).

## Structure

| Path | Content |
| --- | --- |
| `build.gradle`, `settings.gradle`, `gradle.properties`, `model/build.gradle`, `vc/build.gradle` | Build with the Add-on Studio plugin 2.20.1; add-on name `ia-mns`; minimum platform 4.28; `autoDDL=false`. Machine values come from `local.properties` or the environment. |
| `gradle/`, `gradlew`, `gradlew.bat` | Official Gradle 8.2 wrapper with a pinned distribution checksum. |
| `model/src/main/java/br/com/grupomns/iamns/sankhya/` | `IaMnsHostController` (`IaMnsHostSP`), host configuration, assertion signing and failures. |
| `model/src/test/java/` | JUnit tests of signing and configuration. |
| `vc/src/main/webapp/html5/IaMns/` | The host screen (AngularJS `sk-application`, as Om HTML5 screens require). |
| `vc/src/main/webapp/WEB-INF/web.xml`, `vc/src/main/webapp/assets/icon.png` | Om web module descriptor (from the Sankhya template) and the IA-MNS icon, which the Om serves publicly. |
| `datadictionary/menu.xml` | The only Om artifact: the IA-MNS menu entry. The add-on creates no tables, scripts, dashboards or parameters. |

Gradle, Add-on Studio and IDEs generate `.gradle/`, `model/.ant/`, `build/`, `buildGradle/`, `ejbsrc/`, `.idea/`, `.run/` and an empty `model/src/main/resources/META-INF/parameter.xml`; `.gitignore` excludes them, as well as `local.properties`, keys and built packages.

## Development environment

The environment follows the [Sankhya Developer add-on documentation](https://developer.sankhya.com.br/docs/add-on):

- JDK 8 as `JAVA_HOME`; newer JDKs are not compatible with the Om;
- the Sankhya development database (`sankhyaimages` Docker image) and a development WildFly with the Om installed through WPM, reachable at `http://localhost:8080`;
- access to Sankhya's partner Maven repository for the Add-on Studio plugin and Om libraries;
- `local.properties`, copied from `local.properties.example`, with `wildfly.home` (forward slashes) and `sankhya.appKey`, the appKey of the IA-MNS solution from the Sankhya developer area. The environment variables `WILDFLY_HOME` and `SANKHYA_ADDON_APP_KEY` may replace it.

Use only development users and development keys there. The Docker commands publish the database port on every interface, a development WildFly may listen on every interface (including its debug port), and the template's example login uses a development user without a password: keep these ports reachable only from the local machine or a trusted network. Never point the add-on or a local IA-MNS at the production Om for experiments.

Known development-environment behavior, observed on 2026-10-06:

- The first Om boot can take about 25 minutes, longer than the WildFly deployment scanner's 600-second timeout, which then marks Om micro-modules as failed. The add-on needs `placemm.ear` (the Om's local "Place" module): when `standalone/deployments/placemm.ear.failed` exists, delete that marker so the scanner deploys it.
- With every Om module deployed, the WildFly default `-XX:MaxMetaspaceSize=256m` in `bin/standalone.conf.bat` runs out of metaspace and the Om hangs; 1024m worked.
- After a WildFly restart the add-on can start before `placemm` and fail with "Não foi possível estabelecer conexão com o Place". Redeploy it with `./gradlew deployAddon` or by replacing `ia-mns.ear.failed` with `ia-mns.ear.dodeploy`.

## Local journey

1. Start the local IA-MNS database, API and identity as in [setup](../../docs/setup.md#corporate-agent-and-local-postgresql).
2. Run `pnpm sankhya:local --wildfly-home <WildFly folder>` from the repository root. It generates a development P-256 signing key and `ia-mns-addon.properties` in the WildFly `standalone/configuration` folder (outside this repository) and adds `SANKHYA_IDENTITY_ISSUER=sankhya-om-development`, the matching public `SANKHYA_IDENTITY_KEYS` and `SANKHYA_EMBED_ORIGIN=http://localhost:8080` to the ignored root `.env.local`. It refuses non-loopback origins and production. Restart the API afterwards.
3. Start the web server so the Om may frame IA-MNS, for example in PowerShell: `$env:ORION_WEB_EMBED_ANCESTORS='http://localhost:8080'; pnpm -C apps/web dev`.
4. Deploy the add-on (below) and, as an Om administrator, grant the screen **IA-MNS** (resource `ia-mns.IaMns`) to the development users through the Om access control.
5. Sign in to the Om at `http://localhost:8080/mge` with a development user and open **IA-MNS** from the menu. Use `localhost`, not `127.0.0.1`: the frame policy allows only the configured Om origin.

The development identity issuer is distinct from any production installation, so development CODUSU links never match production users. A Sankhya link grants `sales:read` by the default provider policy ([identity](../../docs/domains/identity.md#authorization)), so a development Om user can query whatever ERP the local IA-MNS is configured for.

## Build and verification

Run from this directory:

```sh
./gradlew model:test
./gradlew clean deployAddon
```

`model:test` runs the JUnit tests. `deployAddon` builds the add-on and deploys `ia-mns.ear` to the WildFly in `wildfly.home`; the Om then imports the menu entry. `pnpm validate` and CI do not build or test this project ([validation](../../docs/validation.md)); report the Gradle checks and the development-Om checks that actually ran.

## Repository cautions

The IA-MNS repository is public.

- **Solution `appKey`.** It lives only in the ignored `local.properties` or the environment. The built package (`build/dist/extension.xml`, ignored) contains it because the Sankhya package format requires it.
- **Keys and credentials.** Signing keys stay with the WildFly operator (`standalone/configuration`), never in this repository or in Om sources; IA-MNS receives only public keys (`SANKHYA_IDENTITY_KEYS`). Sankhya account or partner-repository credentials and `.env` files stay out of tracked files, including `gradle.properties`.
- **Public assets.** Everything under `vc/src/main/webapp/assets/` is publicly served by the Om.
- **MNS environment.** Keep MNS hostnames, addresses, Om versions and internal findings out of this directory, as for the rest of the repository.
- **Template licensing.** The Sankhya template carried no license statement. Its guide, examples, icon, `.gitignore` and `.editorconfig` were removed or replaced; `vc/src/main/webapp/WEB-INF/web.xml` remains from the template because the Om requires it; `.gitignore` keeps it out of the repository until [PH-17](../../docs/project/human-actions.md#ph-17) decides whether it may be published, so a fresh clone needs the `web.xml` of the template from the Sankhya developer area.
- **Text encoding and line endings.** Sources are ASCII or UTF-8; `menu.xml` declares ISO-8859-1 and stays ASCII. `.gitattributes` keeps `gradlew.bat` in CRLF and the wrapper JAR binary.

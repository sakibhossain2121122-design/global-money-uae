# Android build repair prepared for PR #2

## Confirmed cause

Repository: `sakibhossain2121122-design/global-money-uae`.
PR: https://github.com/sakibhossain2121122-design/global-money-uae/pull/2
Head branch: `sakibhossain2121122-design-patch-1`.
Inspected head: `aef447b862ff9e1072a844691316c1b72e580a7b`.
Inspected main: `7882f7967daa58d0b6c99d4e2618a96d8b65c1c9`.

The recursive tree of the PR head contains only `.gitignore`, `README.md` and
`.github/workflows/android.yml`. Main contains only `.gitignore` and `README.md`.
The original remote `.gitignore` does not ignore JAR files or the wrapper path;
ignore rules are not the cause of this failure. Neither tree is truncated. There is no native Android directory on either remote
branch. The Android project exists in the original Codex workspace at
`/workspace/android/`.

Run https://github.com/sakibhossain2121122-design/global-money-uae/actions/runs/41330613786
failed at **Validate Gradle Wrapper**. The build/test and APK-upload steps were
skipped. Adding a workflow alone did not upload the source project.

| Required path | Original workspace | Inspected GitHub PR branch | Prepared local PR checkout |
| --- | --- | --- | --- |
| `android/gradlew` | Present | Absent | Present |
| `android/gradlew.bat` | Present | Absent | Present |
| `android/gradle/wrapper/gradle-wrapper.jar` | Present | Absent | Present |
| `android/gradle/wrapper/gradle-wrapper.properties` | Present | Absent | Present |
| `android/settings.gradle.kts` | Present | Absent | Present |
| `android/build.gradle.kts` | Present | Absent | Present |
| `android/gradle.properties` | Present | Absent | Present |
| `android/app/build.gradle.kts` | Present | Absent | Present |
| `android/app/src/main/AndroidManifest.xml` | Present | Absent | Present |
| Kotlin sources, resources, unit tests | Present | Absent | Present |

## Prepared change

Include the entire standalone Android project, wrapper, Kotlin sources, manifest,
English/Bengali resources and unit tests together with the workflow. Keep the
remote README and ignore rules, and add Android documentation and an explicit
wrapper-JAR unignore rule. Netlify files and settings remain untouched.

The workflow now handles push, pull_request and workflow_dispatch, checks for
missing project files early, configures Java 17 and SDK 35 / Build Tools 34.0.0,
retains the official wrapper-validation action and enables setup-gradle wrapper
validation. It runs resource/integrity checks, unit tests, lint and assembleDebug,
then uploads the exact debug APK and available reports.

The existing workspace wrapper is genuine: all three executable files were
re-fetched from official Gradle tag v8.9.0 and matched byte-for-byte. See
[wrapper provenance](../android/gradle/wrapper/README.md) for source URLs and
hashes. No replacement or fabricated JAR is needed; the fix is to include the
verified files in Git. Validation has not been bypassed.

## Preparation and validation

The isolated local checkout is `/workspace/review/global-money-uae`, on the same
branch name as PR #2. The original workspace has no usable Git metadata and its
`.git` mount is read-only, so it cannot serve as the PR checkout. The GitHub
connector was used read-only to import the existing remote tip and file objects
into the isolated checkout. Their Git object hashes were verified against the
remote hashes. HEAD remains the exact existing PR tip; no new commit was made.
All proposed changes are uncommitted local files.

Passed: required-file checks, English/Bengali resource parity (61 keys), string
format placeholders and Kotlin resource references, XML parsing, manifest demo
boundaries, official wrapper JAR/script hashes and JAR archive integrity, wrapper
shell syntax, Git ignore checks, workflow YAML/preflight/triggers/tasks/upload
checks and Git whitespace checks.

The command `bash ./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug`
was attempted with a writable temporary GRADLE_USER_HOME. The wrapper started
and attempted the official Gradle 8.9 download, which failed with
`java.net.SocketException: Operation not permitted`. This environment has only a
Java 21 runtime, no javac compiler, no installed Android SDK and no cached Gradle
distribution. Android compilation, unit tests, lint and device testing therefore
remain unverified. No APK was generated and no new GitHub run was triggered.

The connected account reports read access but no push permission for this
repository. Remote commits, pushes, PR edits, merges and deployments have not
been performed. Publishing this prepared change requires the user's approval
and a connection with write access (or the repository owner applying the patch).

## Exact changed files

Relative to the inspected PR head, the prepared change contains:

- `.gitattributes`
- `.github/workflows/android.yml`
- `.gitignore`
- `README.md`
- `android/README.md`
- `android/app/build.gradle.kts`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/globalmoney/uae/demo/DemoMoney.kt`
- `android/app/src/main/java/com/globalmoney/uae/demo/MainActivity.kt`
- `android/app/src/main/res/drawable/ic_logo.xml`
- `android/app/src/main/res/values-bn/strings.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/src/main/res/values/themes.xml`
- `android/app/src/test/java/com/globalmoney/uae/demo/DemoMoneyTest.kt`
- `android/build.gradle.kts`
- `android/gradle.properties`
- `android/gradle/wrapper/README.md`
- `android/gradle/wrapper/gradle-wrapper.jar`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/gradlew`
- `android/gradlew.bat`
- `android/settings.gradle.kts`
- `android/tools/check_project.py`
- `docs/android-build-repair.md`

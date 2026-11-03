# Official Gradle Wrapper provenance

All wrapper executables are copied unmodified from the official `gradle/gradle`
repository, tag `v8.9.0`. They were re-fetched through the GitHub connector and
compared byte-for-byte with this project's files during repair preparation.
No JAR was generated, substituted or fabricated.

| File (relative to android/) | Official Git blob SHA-1 | SHA-256 |
| --- | --- | --- |
| `gradlew` | `d95bf6131dc41079a1665889f84d4cfec92a2bc1` | `9cbbb4d68ff7fb5211c4d58f598ac9d8664c05fdcd1e5f59b7f2c3ac1ee00af0` |
| `gradlew.bat` | `640d68685c14950470c82031e02198e220b96e62` | `0f3ed8f03b50934cb8c48b15a470d5c20a30a5385825e48b55bcc8ea3d8f8e18` |
| `gradle/wrapper/gradle-wrapper.jar` | `2c3521197d7c4586c843d1d3e9090525f1898cde` | `498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17` |

Official source files:

- https://github.com/gradle/gradle/blob/v8.9.0/gradlew
- https://github.com/gradle/gradle/blob/v8.9.0/gradlew.bat
- https://github.com/gradle/gradle/blob/v8.9.0/gradle/wrapper/gradle-wrapper.jar

`gradle-wrapper.properties` selects the official Gradle 8.9 binary distribution.
The CI workflow keeps `gradle/actions/wrapper-validation@v4` and setup-gradle's
wrapper validation enabled. The local static checker additionally checks the
pinned JAR and script hashes and JAR ZIP integrity. Do not disable validation to
work around missing files; include the entire Android project in the PR.

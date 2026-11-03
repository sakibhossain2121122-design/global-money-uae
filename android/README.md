# GLOBAL MONEY UAE — Native Android DEMO

A standalone Kotlin / Jetpack Compose / Material 3 Android demo in this `android/` directory. The palette uses emerald, navy, white and gold. English and Bengali are available from the language switch on every screen; the initial language follows the device language when Bengali is selected.

The Android project is independent of Netlify. No website files, Netlify configuration, npm configuration or deployment settings are created or changed. Keep any existing website at its existing location and use `android/` only for Android Studio and Gradle.

## Demo experience

- Welcome → credential-free sign-in as **Demo Guest** → dashboard with **AED 2,450.00 • DEMO** balance.
- AED → BDT calculator uses a fictional fixed rate of **32.50 BDT per AED**, exact decimal arithmetic and half-up rounding. Accepts 0.01–100,000.00 AED with at most two decimal places, using ASCII digits and a dot.
- Add Money creates an in-memory **DEMO pending** request, visible in history. It never changes the balance.
- **BOTIM MONEY is disabled and display-only**, with no affiliation or integration.
- bKash, Nagad, Rocket, Upay and Bank each open a beneficiary detail screen with deliberately invalid sample identifiers. Add a sample to the session list; duplicate samples are detected.
- History has completed, pending and failed fictional examples and individual status screens. New Add Money requests also appear here.
- Customer support provides bilingual FAQs and a simulated local ticket. The `.example` address is display-only.

No credentials, real names, phone numbers, banking details, identity documents or KYC are collected. There are no payment SDKs, network permissions, external APIs, analytics, secrets, databases or persistent financial data. Session data resets on **End demo session**, process restart or activity recreation. Requests and support tickets never leave the device. Brand names identify display-only demo payout options.

## Build

Requirements: JDK **17**, Android SDK Platform **35**, Build Tools **34.0.0**, and internet access for first-time dependency downloads. Minimum device: Android **8.0 / API 26**.

Pinned stable tools: Gradle **8.9**, Android Gradle Plugin **8.7.3**, Kotlin and Compose compiler plugin **2.0.21**, Compose BOM **2024.12.01**, Activity Compose **1.9.3**, JUnit **4.13.2**.

Open `android/` in Android Studio and let it sync, or configure `ANDROID_HOME` / an untracked `android/local.properties` with `sdk.dir`, then run:

```sh
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
```

Windows: use `gradlew.bat` with the same tasks. The official Gradle Wrapper JAR and Unix/Windows scripts are included. The wrapper JAR SHA-256 is `498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17` (from Gradle tag `v8.9.0`).

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug-signed demo, not a production release.

## APK ডাউনলোড ও ইনস্টল (বাংলা)

1. এই ফাইলগুলো GitHub রিপোজিটরিতে push করুন। **Actions → Android DEMO APK** খুলুন। Push করলে বিল্ড স্বয়ংক্রিয়ভাবে চলবে; নিজে চালাতে **Run workflow** চাপুন। ম্যানুয়ালভাবে চালানোর জন্য workflow ফাইলটি default branch-এ থাকতে হবে।
2. সবুজ সফল চিহ্ন আসা পর্যন্ত অপেক্ষা করুন। সফল run খুলে নিচের **Artifacts** থেকে **GLOBAL-MONEY-UAE-demo-apk** ডাউনলোড করুন। Artifacts ডাউনলোড করতে GitHub-এ সাইন-ইন লাগতে পারে। ফাইলটি ১৪ দিন রাখা হয়।
3. ZIP ফাইল extract করে **app-debug.apk** বের করুন এবং Android ফোনে নিন। Android 8.0 বা পরের সংস্করণ দরকার।
4. ফোনের Files অ্যাপ দিয়ে APK খুলুন। প্রয়োজন হলে ওই Files অ্যাপের জন্য **Settings → Install unknown apps → Allow from this source** সাময়িকভাবে চালু করুন। নিজের বিশ্বস্ত রিপোজিটরির APK-ই ইনস্টল করুন।
5. **Install → Open** চাপুন। ইনস্টল হয়ে গেলে unknown apps-এর অনুমতিটি বন্ধ করুন।
6. অ্যাপের উপরে **বাংলা** চাপুন। **DEMO দেখুন → Demo Guest হিসেবে চালিয়ে যান** দিয়ে শুরু করুন। কোনো আসল পাসওয়ার্ড, ফোন নম্বর বা পরিচয়পত্র দেবেন না। সব অর্থ, রেট ও কাজ **DEMO**।
7. পুরোনো একই প্যাকেজের অ্যাপের signing key আলাদা হলে ইনস্টল ব্যর্থ হতে পারে। সে ক্ষেত্রে পুরোনো DEMO অ্যাপ আনইনস্টল করে আবার ইনস্টল করুন; পুরোনো অ্যাপের ডেটা মুছে যাবে।

কম্পিউটার থেকে ইনস্টল করতে USB debugging চালু রেখে ব্যবহার করতে পারেন:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Validation and limitations

The GitHub workflow at [`.github/workflows/android.yml`](../.github/workflows/android.yml) runs on every push, pull request and `workflow_dispatch`, configures Java 17 and Android SDK 35, then runs unit tests, lint and debug assembly with the pinned wrapper. It uploads the APK only after successful checks and uploads available reports even on failure. No release credentials are required.

Local verification in this workspace: XML/resource parity and references, manifest demo boundaries, wrapper ZIP integrity and SHA-256, shell syntax, and workflow structure were checked. The Gradle build was attempted with a writable `GRADLE_USER_HOME`; it stopped during Gradle distribution download with `java.net.SocketException: Operation not permitted`. This workspace has Java 21 runtime only, no JDK compiler, no installed Android SDK, and no cached Gradle distribution. Unit tests, Android lint, compilation and emulator/device testing could not run here. No APK has been built locally; CI has not been run from this workspace.

After a successful build, smoke-test both languages on a device: welcome/sign-in, all dashboard routes, invalid calculator amounts, Add Money → pending history detail, each of the five sample beneficiaries and duplicates, disabled BOTIM MONEY, support ticket, back navigation and session reset. Also check large font sizes and portrait/landscape layouts.

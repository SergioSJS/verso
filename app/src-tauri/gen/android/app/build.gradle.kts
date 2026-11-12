import java.util.Properties
import javax.inject.Inject
import org.gradle.process.ExecOperations

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.versomd.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.versomd.app"
        minSdk = 29
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            // Signed with the debug key until the maintainer makes the
            // release keystore (a long-lived secret: his to create and
            // keep, ADR 0118 item 9's "signed APK"). An APK signed by one
            // key cannot update an install signed by another.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    // The native libraries on disk (not run from inside the APK), so that
    // libcloudflared.so can be started as a program (ADR 0118 item 3.3).
    packaging {
        jniLibs.useLegacyPackaging = true
    }
}

rust {
    rootDirRel = "../../../"
}

// The Kotlin half of rustls-platform-verifier (the system's certificate
// check, src/android.rs): its Maven repository, at the version Cargo.lock
// holds for `rustls-platform-verifier-android` (the two must be the same).
repositories {
    maven {
        url = uri("https://github.com/rustls/rustls-platform-verifier/raw/maven-archive/android-release-support/maven/")
    }
}

abstract class RustlsVersion : ValueSource<String, RustlsVersion.Params> {
    interface Params : ValueSourceParameters {
        val lockFile: RegularFileProperty
    }

    override fun obtain(): String {
        val lines = parameters.lockFile.get().asFile.readLines()
        val at = lines.indexOfFirst { it.trim() == "name = \"rustls-platform-verifier-android\"" }
        return lines.drop(at + 1)
            .firstOrNull { it.trimStart().startsWith("version = ") }
            ?.substringAfter('"')?.substringBefore('"')
            ?.takeIf { at >= 0 && it.isNotEmpty() }
            ?: error("rustls-platform-verifier-android not found in Cargo.lock")
    }
}

val rustlsVersion = providers.of(RustlsVersion::class.java) {
    parameters.lockFile.set(layout.projectDirectory.file("../../../../../Cargo.lock"))
}

configurations.configureEach {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.rustls" && requested.name == "rustls-platform-verifier") {
            useVersion(rustlsVersion.get())
        }
    }
}

// The internet link's cloudflared (ADR 0118 item 3.3): shipped as the native
// library libcloudflared.so, so that Android puts it on disk where the app
// may run it (an app targeting API 29+ cannot run a file it wrote). jniLibs/
// is not in git: this step builds it for Android from the pinned source
// (scripts/android/cloudflared.sh, decided 2026-11-12: Cloudflare's
// linux-arm64 build resolves no name on Android) and places it. A source
// whose SHA-256 differs from the pin stops the build. `cloudflared` is
// Apache-2.0; its notice ships with the app's credits.
abstract class PlaceCloudflared @Inject constructor(private val exec: ExecOperations) : DefaultTask() {
    @get:InputFile
    abstract val script: RegularFileProperty

    @get:InputFile
    abstract val pins: RegularFileProperty

    @get:OutputFile
    abstract val target: RegularFileProperty

    @TaskAction
    fun place() {
        exec.exec {
            commandLine(script.get().asFile.absolutePath, target.get().asFile.absolutePath)
        }
    }
}

val placeCloudflared = tasks.register<PlaceCloudflared>("placeCloudflared") {
    script.set(layout.projectDirectory.file("../../../../../scripts/android/cloudflared.sh"))
    pins.set(layout.projectDirectory.file("../../../src/tunnel/fetch.rs"))
    target.set(layout.projectDirectory.file("src/main/jniLibs/arm64-v8a/libcloudflared.so"))
}

tasks.named("preBuild") { dependsOn(placeCloudflared) }

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    implementation("org.rustls:rustls-platform-verifier:latest.release")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
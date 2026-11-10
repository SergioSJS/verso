import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.Properties

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
// is not in git: this step downloads the release pinned in
// src/tunnel/fetch.rs (VERSION, the linux-arm64 row) once into build/, checks
// its SHA-256 against the pin, and places it. A sum that differs stops the
// build. `cloudflared` is Apache-2.0; its notice ships with the app's credits.
abstract class PlaceCloudflared : DefaultTask() {
    @get:InputFile
    abstract val pins: RegularFileProperty

    @get:Internal
    abstract val cache: DirectoryProperty

    @get:OutputFile
    abstract val target: RegularFileProperty

    @TaskAction
    fun place() {
        val text = pins.get().asFile.readText()
        val version = Regex("""pub const VERSION: &str = "([^"]+)";""").find(text)?.groupValues?.get(1)
            ?: throw GradleException("no VERSION in fetch.rs")
        val sum = Regex("""asset: "cloudflared-linux-arm64",\s*sha256: "([0-9a-f]{64})"""").find(text)?.groupValues?.get(1)
            ?: throw GradleException("no linux-arm64 pin in fetch.rs")
        fun sha256(f: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            f.inputStream().use { input ->
                val buffer = ByteArray(1 shl 16)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    digest.update(buffer, 0, n)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
        val kept = cache.file("cloudflared-linux-arm64-$version").get().asFile
        if (!kept.exists() || sha256(kept) != sum) {
            kept.parentFile.mkdirs()
            val part = File(kept.path + ".part")
            val url = URI("https://github.com/cloudflare/cloudflared/releases/download/$version/cloudflared-linux-arm64").toURL()
            url.openStream().use { input -> part.outputStream().use { input.copyTo(it) } }
            val got = sha256(part)
            if (got != sum) {
                part.delete()
                throw GradleException("cloudflared $version linux-arm64: SHA-256 $got is not the pinned $sum")
            }
            part.renameTo(kept)
        }
        val out = target.get().asFile
        out.parentFile.mkdirs()
        kept.copyTo(out, overwrite = true)
    }
}

val placeCloudflared = tasks.register<PlaceCloudflared>("placeCloudflared") {
    pins.set(layout.projectDirectory.file("../../../src/tunnel/fetch.rs"))
    cache.set(layout.buildDirectory.dir("cloudflared"))
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
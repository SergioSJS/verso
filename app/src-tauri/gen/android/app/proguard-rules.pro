# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# The Kotlin half of the certificate check, reached only through JNI.
-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }
# The app's own Tauri plugins and the arguments their commands parse by
# reflection (src/phone.rs, src/mobile.rs), the serving service, and the
# keyring store's JNI entry: reached by name, never renamed.
-keep class com.versomd.app.PhonePlugin { *; }
-keep class com.versomd.app.StatusBarPlugin { *; }
-keep class com.versomd.app.*Args { *; }
-keep class com.versomd.app.ServeService { *; }
-keep class io.crates.keyring.Keyring { *; }
-keep class io.crates.keyring.Keyring$Companion { *; }

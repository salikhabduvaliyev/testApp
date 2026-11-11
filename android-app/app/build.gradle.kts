import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

val localProps = Properties().apply {
  val f = rootProject.file("local.properties")
  if (f.exists()) f.inputStream().use { load(it) }
}

fun propOrEmpty(key: String): String {
  return (localProps.getProperty(key) ?: System.getenv(key) ?: "").trim()
}

fun detectLanServerUrl(): String {
  val explicit = propOrEmpty("SERVER_URL")
  if (explicit.isNotBlank()) return explicit.trimEnd('/')
  return try {
    val addrs = NetworkInterface.getNetworkInterfaces().toList()
      .filter { it.isUp && !it.isLoopback && !it.isVirtual }
      .flatMap { it.inetAddresses.toList() }
      .filterIsInstance<Inet4Address>()
      .mapNotNull { it.hostAddress }
      .filter { !it.startsWith("127.") && !it.startsWith("169.254.") }
    val preferred = addrs.firstOrNull {
      it.startsWith("192.168.") || it.startsWith("10.") || it.startsWith("172.")
    } ?: addrs.firstOrNull()
    if (preferred != null) "http://$preferred:8000" else "http://10.0.2.2:8000"
  } catch (_: Exception) {
    "http://10.0.2.2:8000"
  }
}

android {
  namespace = "uz.dono.app"
  compileSdk = 36
  defaultConfig {
    applicationId = "uz.dono.app"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"

    val lanUrl = detectLanServerUrl()
    buildConfigField("String", "EMULATOR_SERVER_URL", "\"http://10.0.2.2:8000\"")
    buildConfigField("String", "LAN_SERVER_URL", "\"$lanUrl\"")
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    aidl = false
    buildConfig = true
    shaders = false
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose & Material 3
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.material.icons)

  // Networking & Serialization
  implementation(libs.okhttp)
  implementation(libs.kotlinx.serialization.json)

  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)
}

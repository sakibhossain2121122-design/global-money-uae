package com.globalmoney.uae.demo

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import org.junit.Rule
import org.junit.Test
import org.junit.Assume.assumeTrue
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL
import java.util.concurrent.Executors

/** Opt-in local UI evidence. No mocked rates, balances or transaction responses.
 * The test-only transport forwards to an actual disposable localhost API via
 * the emulator host-loopback alias 10.0.2.2:3116. It is never included in the distributable APK.
 */
class PremiumScreenshotsTest {
 @get:Rule val rule=createComposeRule()
 private fun capture(name:String){
  rule.waitForIdle()
  val folder=File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null),"screenshots");folder.mkdirs()
  File(folder,"$name.png").outputStream().use{rule.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG,100,it)}
 }
 private fun click(text:String){rule.onNodeWithText(text).performScrollTo().performClick();rule.waitForIdle()}
 @Test fun nativePremiumScreens(){
  assumeTrue(InstrumentationRegistry.getArguments().getString("localScreenshots")=="true")
  val executor=Executors.newSingleThreadExecutor();val handler=Handler(Looper.getMainLooper())
  val api=AccountApi("https://global-money-uae-staging-api.onrender.com"){LocalConnection(it)}
  try{
   rule.setContent{PremiumApp(api){work,done->executor.execute{val r=runCatching(work);handler.post{done(r)}}}}
   rule.mainClock.advanceTimeBy(1200);rule.waitUntil(10000){rule.onAllNodesWithText("Get started").fetchSemanticsNodes().isNotEmpty()}
   capture("01-welcome-en")
   click("Get started");capture("02-register-en")
   click("Already registered? Sign in");capture("03-login-en")
   rule.onNodeWithText("Email address").performTextInput("customer@example.invalid")
   rule.onNodeWithText("Password • 12–128 characters").performTextInput("Screenshots-Only-123!")
   click("Sign in")
   rule.waitUntil(15000){rule.onAllNodesWithText("A little closer to home.").fetchSemanticsNodes().isNotEmpty()}
   rule.waitUntil(15000){rule.onAllNodesWithText("Not configured").fetchSemanticsNodes().isNotEmpty()}
   capture("04-home-en")
   click("Add Money");rule.waitUntil(10000){rule.onAllNodesWithText("ADCB").fetchSemanticsNodes().isNotEmpty()};capture("05-add-money-en")
   click("← Back to home");click("Send Money");capture("06-send-money-en")
   rule.onNodeWithText("History",useUnmergedTree=true).performClick();rule.waitForIdle();capture("07-history-en")
   rule.onNodeWithText("Support",useUnmergedTree=true).performClick();rule.waitForIdle();capture("08-support-en")
   rule.onNodeWithText("Profile",useUnmergedTree=true).performClick();rule.waitUntil(10000){rule.onAllNodesWithText("Save profile").fetchSemanticsNodes().isNotEmpty()};capture("09-profile-en")
   rule.onNodeWithText("Home",useUnmergedTree=true).performClick();rule.waitForIdle()
   click("Manage beneficiaries →");capture("10-beneficiaries-en")
   click("← Back to home");click("View server-controlled methods");capture("11-methods-en")
   click("← Back to home");rule.onNodeWithText("বাংলা").performClick();rule.waitForIdle();capture("12-home-bn")
  }finally{api.token=null;executor.shutdownNow();handler.removeCallbacksAndMessages(null)}
 }
}

/** Raw HTTP is restricted to loopback and compiled exclusively into androidTest.
 * HTTP/1.0 closes the response so the real Node API body is read without fixtures.
 */
private class LocalConnection(url:URL):HttpURLConnection(url){
 private val sent=ByteArrayOutputStream();private var status=0;private var response=byteArrayOf()
 override fun connect(){if(status!=0)return
  require(url.host=="global-money-uae-staging-api.onrender.com")
  Socket("10.0.2.2",3116).use{s->s.soTimeout=10000
   val body=sent.toByteArray();val headers=requestProperties.entries.joinToString(""){(k,v)->"$k: ${v.joinToString(",")}\r\n"}
   val start="$requestMethod ${url.path} HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\nContent-Length: ${body.size}\r\n$headers\r\n"
   s.getOutputStream().write(start.toByteArray()+body);s.getOutputStream().flush()
   val bytes=s.getInputStream().readBytes();val all=bytes.toString(Charsets.UTF_8);val split=all.indexOf("\r\n\r\n");require(split>=0)
   status=all.substringBefore("\r\n").split(' ')[1].toInt();response=bytes.copyOfRange(split+4,bytes.size)
  }
 }
 override fun getOutputStream()=sent
 override fun getResponseCode():Int{connect();return status}
 override fun getInputStream():ByteArrayInputStream{connect();return ByteArrayInputStream(response)}
 override fun disconnect(){}
 override fun usingProxy()=false
}

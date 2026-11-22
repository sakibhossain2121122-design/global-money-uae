package com.globalmoney.uae.demo

import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import org.junit.Assert.*
import org.junit.Test

class AccountQrTest {
    @Test fun referenceQrRoundTripsEnglishAndBengaliWithoutRemoteImages() {
        for (content in listOf("ACCOUNT-REFERENCE-123", "অ্যাকাউন্টের তথ্য ১২৩")) {
            val matrix = AccountQr.encode(content)
            val pixels = IntArray(384 * 384) { p -> if (matrix[p % 384, p / 384]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt() }
            val decoded = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(384, 384, pixels))))
            assertEquals(content, decoded.text)
        }
    }
    @Test fun missingOrOversizedContentIsRejected() {
        for (content in listOf("", " ", "x".repeat(513))) {
            try { AccountQr.encode(content); fail("Expected invalid content") } catch (_: IllegalArgumentException) { }
        }
    }
}

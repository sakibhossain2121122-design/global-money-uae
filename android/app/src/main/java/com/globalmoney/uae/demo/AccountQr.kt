package com.globalmoney.uae.demo

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter

/** Reference rendering only; never launches a scanner, URL, payment intent or provider. */
internal object AccountQr {
    fun encode(content: String): BitMatrix {
        require(content.isNotBlank() && content.length <= 512)
        return QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 384, 384,
            mapOf(EncodeHintType.CHARACTER_SET to "UTF-8"))
    }
}

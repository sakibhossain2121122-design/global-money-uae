package com.globalmoney.uae.demo

import java.math.BigDecimal
import java.math.RoundingMode

/** Deliberately fixed, fictional values; never a live exchange quote. */
object DemoMoney {
    val rate: BigDecimal = BigDecimal("32.50")
    fun parseAmount(input: String): BigDecimal? {
        if (!Regex("[0-9]{1,6}(\\.[0-9]{1,2})?").matches(input)) return null
        return input.toBigDecimalOrNull()?.takeIf {
            it >= BigDecimal("0.01") && it <= BigDecimal("100000.00")
        }
    }
    fun toBdt(aed: BigDecimal): BigDecimal = aed.multiply(rate).setScale(2, RoundingMode.HALF_UP)
    fun display(amount: BigDecimal): String = amount.setScale(2, RoundingMode.HALF_UP).toPlainString()
}

enum class DemoStatus { COMPLETED, PENDING, FAILED }
data class DemoTransaction(val id: String, val method: String, val aed: String, val status: DemoStatus)
fun sampleTransactions() = listOf(
    DemoTransaction("DEMO-1001", "bKash", "150.00", DemoStatus.COMPLETED),
    DemoTransaction("DEMO-1002", "Bank", "300.00", DemoStatus.PENDING),
    DemoTransaction("DEMO-1003", "Nagad", "75.00", DemoStatus.FAILED)
)

package com.globalmoney.uae.demo

internal object AddMoneyDraft {
    fun validAmount(value: String): Boolean {
        if (!value.matches(Regex("(0|[1-9][0-9]{0,6})(\\.[0-9]{1,2})?"))) return false
        val amount = value.toBigDecimalOrNull() ?: return false
        return amount >= "0.01".toBigDecimal() && amount <= "1000000.00".toBigDecimal()
    }
}

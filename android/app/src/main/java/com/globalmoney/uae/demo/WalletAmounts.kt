package com.globalmoney.uae.demo

import org.json.JSONObject

internal data class WalletAmounts(val available: String?, val reserved: String?) {
    companion object {
        fun parse(json: String): WalletAmounts {
            val wallet = JSONObject(json)
            if (wallet.optString("currency") != "AED") return WalletAmounts(null, null)
            fun amount(key: String) = (wallet.opt(key) as? String)
                ?.takeIf { it.matches(Regex("-?[0-9]+\\.[0-9]{2}")) }
            return WalletAmounts(amount("availableBalance"), amount("heldBalance"))
        }
    }
}

internal fun customerRate(json: String): String? {
    val rate = JSONObject(json)
    if (rate.opt("available") != true || rate.optString("pair") != "AED/BDT") return null
    return (rate.opt("value") as? String)?.takeIf {
        it.matches(Regex("[0-9]+(\\.[0-9]+)?")) && it.toBigDecimalOrNull()?.signum() == 1
    }
}

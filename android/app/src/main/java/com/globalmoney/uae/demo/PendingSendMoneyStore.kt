package com.globalmoney.uae.demo

import android.content.Context
import org.json.JSONObject
import java.security.MessageDigest

internal class PendingSendMoneyStore(context: Context) {
    private val preferences = context.getSharedPreferences("pending_send_money", Context.MODE_PRIVATE)

    private fun key(customerId: String): String {
        require(SendMoneyDraft.validBeneficiary(customerId))
        val bytes = MessageDigest.getInstance("SHA-256")
            .digest((BuildConfig.API_BASE_URL + ":" + customerId).toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    fun load(customerId: String): SendMoneyDraft? =
        preferences.getString(key(customerId), null)?.let { SendMoneyDraft.fromPayload(JSONObject(it)) }

    fun save(customerId: String, draft: SendMoneyDraft) {
        check(preferences.edit().putString(key(customerId), draft.payload().toString()).commit())
    }

    fun clear(customerId: String) {
        check(preferences.edit().remove(key(customerId)).commit())
    }
}

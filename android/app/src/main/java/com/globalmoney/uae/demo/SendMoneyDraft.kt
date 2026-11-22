package com.globalmoney.uae.demo

import org.json.JSONObject
import java.util.UUID

internal data class SendMoneyDraft(
    val amount: String,
    val beneficiaryId: String,
    val idempotencyKey: String
) {
    fun payload(): JSONObject = JSONObject()
        .put("amount_aed", amount)
        .put("beneficiary_id", beneficiaryId)
        .put("idempotency_key", idempotencyKey)

    companion object {
        fun validBeneficiary(id: String): Boolean =
            id.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"))

        fun create(amount: String, beneficiaryId: String): SendMoneyDraft {
            require(AddMoneyDraft.validAmount(amount))
            require(validBeneficiary(beneficiaryId))
            return SendMoneyDraft(amount, beneficiaryId, UUID.randomUUID().toString())
        }

        fun fromPayload(payload: JSONObject): SendMoneyDraft {
            val amount = payload.getString("amount_aed")
            val beneficiaryId = payload.getString("beneficiary_id")
            val key = payload.getString("idempotency_key")
            require(AddMoneyDraft.validAmount(amount) && validBeneficiary(beneficiaryId) && validBeneficiary(key))
            return SendMoneyDraft(amount, beneficiaryId, key)
        }
    }
}

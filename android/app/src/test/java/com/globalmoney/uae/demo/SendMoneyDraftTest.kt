package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test

class SendMoneyDraftTest {
    @Test fun retryUsesTheSameRequestAndOmitsDisplayDetails() {
        val id = "550e8400-e29b-41d4-a716-446655440000"
        val draft = SendMoneyDraft.create("12.34", id)
        val first = draft.payload()
        val retry = draft.payload()
        assertEquals(first.toString(), retry.toString())
        assertEquals("12.34", first.getString("amount_aed"))
        assertEquals(id, first.getString("beneficiary_id"))
        assertEquals(draft.idempotencyKey, first.getString("idempotency_key"))
        assertFalse(first.has("beneficiaryName"))
        assertFalse(first.has("provider"))
        assertEquals(draft, SendMoneyDraft.fromPayload(first))
        assertNotEquals(draft.idempotencyKey, SendMoneyDraft.create("12.34", id).idempotencyKey)
    }

    @Test fun invalidAmountsAndBeneficiariesCannotCreateRequests() {
        assertFalse(SendMoneyDraft.validBeneficiary("not-a-uuid"))
        assertThrows(IllegalArgumentException::class.java) {
            SendMoneyDraft.create("0", "550e8400-e29b-41d4-a716-446655440000")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SendMoneyDraft.create("1.00", "not-a-uuid")
        }
        assertThrows(IllegalArgumentException::class.java) {
            SendMoneyDraft.fromPayload(org.json.JSONObject().put("amount_aed", "1.00")
                .put("beneficiary_id", "550e8400-e29b-41d4-a716-446655440000")
                .put("idempotency_key", "invalid"))
        }
    }
}

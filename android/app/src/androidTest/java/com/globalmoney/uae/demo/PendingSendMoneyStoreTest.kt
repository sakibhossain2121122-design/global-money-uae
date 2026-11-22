package com.globalmoney.uae.demo

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class PendingSendMoneyStoreTest {
    @Test fun pendingRequestSurvivesRecreationAndIsIsolatedByCustomer() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val firstCustomer = UUID.randomUUID().toString()
        val secondCustomer = UUID.randomUUID().toString()
        val draft = SendMoneyDraft.create("12.34", UUID.randomUUID().toString())
        val store = PendingSendMoneyStore(context)
        try {
            store.save(firstCustomer, draft)
            val recreated = PendingSendMoneyStore(context)
            assertEquals(draft, recreated.load(firstCustomer))
            assertNull(recreated.load(secondCustomer))
            recreated.clear(firstCustomer)
            assertNull(store.load(firstCustomer))
        } finally {
            store.clear(firstCustomer)
        }
    }
}

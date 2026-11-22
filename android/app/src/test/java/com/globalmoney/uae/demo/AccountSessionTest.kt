package com.globalmoney.uae.demo

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import org.junit.Assert.*
import org.junit.Test

class AccountSessionTest {
    @Test fun sessionSurvivesRecreationButIsClearedWhenStoreIsDestroyed() {
        val store = ViewModelStore()
        val first = ViewModelProvider(store, ViewModelProvider.NewInstanceFactory())[AccountSession::class.java]
        first.api.token = "session"
        val draft = SendMoneyDraft.create("10.00", "550e8400-e29b-41d4-a716-446655440000")
        first.pendingSendMoney = draft
        val recreated = ViewModelProvider(store, ViewModelProvider.NewInstanceFactory())[AccountSession::class.java]
        assertSame(first, recreated)
        assertEquals("session", recreated.api.token)
        assertEquals(draft, recreated.pendingSendMoney)
        store.clear()
        assertNull(first.api.token)
        assertNull(first.pendingSendMoney)
    }
}

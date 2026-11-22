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
        val recreated = ViewModelProvider(store, ViewModelProvider.NewInstanceFactory())[AccountSession::class.java]
        assertSame(first, recreated)
        assertEquals("session", recreated.api.token)
        store.clear()
        assertNull(first.api.token)
    }
}

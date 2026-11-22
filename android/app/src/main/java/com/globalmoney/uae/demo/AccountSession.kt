package com.globalmoney.uae.demo

import androidx.lifecycle.ViewModel

internal class AccountSession : ViewModel() {
    val api = AccountApi()

    override fun onCleared() {
        api.token = null
    }
}

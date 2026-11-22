package com.globalmoney.uae.demo

import androidx.lifecycle.ViewModel
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

internal class AccountSession : ViewModel() {
    val api = AccountApi()
    var pendingSendMoney by mutableStateOf<SendMoneyDraft?>(null)

    override fun onCleared() {
        api.token = null
        pendingSendMoney = null
    }
}

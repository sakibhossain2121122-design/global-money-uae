package com.globalmoney.uae.demo

internal object Registration {
    fun validMobile(value: String) = value.matches(Regex("\\+9715[0-9]{8}"))
    fun validPasswords(password: String, confirmation: String) =
        password.length in 12..128 && password == confirmation
}

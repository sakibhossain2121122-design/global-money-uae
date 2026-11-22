package com.globalmoney.uae.demo

internal object Registration {
    fun validMobile(value: String) = value.matches(Regex("\\+9715[0-9]{8}"))
    fun validPasswords(password: String, confirmation: String) =
        password.length in 12..128 && password == confirmation

    fun missingFields(name: String, mobile: String, email: String, password: String, confirmation: String): List<Field> =
        buildList {
            if (name.isBlank()) add(Field.NAME)
            if (!validMobile(mobile)) add(Field.MOBILE)
            if (email.isBlank()) add(Field.EMAIL)
            if (password.length !in 12..128) add(Field.PASSWORD)
            if (password != confirmation || confirmation.isEmpty()) add(Field.CONFIRMATION)
        }

    enum class Field { NAME, MOBILE, EMAIL, PASSWORD, CONFIRMATION }
}

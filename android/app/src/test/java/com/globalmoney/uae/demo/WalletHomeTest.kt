package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test

class WalletHomeTest {
    @Test fun walletUsesOnlyServerAvailableAndHeldBalances() {
        val amounts = WalletAmounts.parse("""{"currency":"AED","balance":"100.00","availableBalance":"70.00","heldBalance":"30.00"}""")
        assertEquals("70.00", amounts.available)
        assertEquals("30.00", amounts.reserved)
        assertEquals(WalletAmounts(null, null), WalletAmounts.parse("""{"currency":"AED","balance":"100.00","availableBalance":null,"heldBalance":null}"""))
        assertEquals(WalletAmounts(null, null), WalletAmounts.parse("""{"currency":"BDT","availableBalance":"1.00","heldBalance":"0.00"}"""))
        assertEquals(WalletAmounts(null, null), WalletAmounts.parse("""{"currency":"AED","availableBalance":12,"heldBalance":"invalid"}"""))
    }

    @Test fun rateRequiresAnAvailablePositiveCustomerRateForTheCorrectPair() {
        assertNull(customerRate("""{"pair":"AED/BDT","value":null,"available":false}"""))
        assertNull(customerRate("""{"pair":"AED/BDT","value":"30.00","available":false}"""))
        assertNull(customerRate("""{"pair":"AED/USD","value":"30.00","available":true}"""))
        assertNull(customerRate("""{"pair":"AED/BDT","value":"0.00","available":true}"""))
        assertEquals("30.125", customerRate("""{"pair":"AED/BDT","value":"30.125","available":true}"""))
    }
}

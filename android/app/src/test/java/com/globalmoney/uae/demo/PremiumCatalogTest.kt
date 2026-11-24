package com.globalmoney.uae.demo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class PremiumCatalogTest {
    @Test fun catalogsExposeRequestedProvidersWithoutEnablingPayments() {
        assertEquals(listOf("BOTIM Money", "e& money", "ADCB", "Emirates NBD", "ADIB", "Additional UAE bank"), PremiumCatalog.uaePaymentMethods)
        assertEquals(listOf("bKash", "Nagad", "Rocket", "Upay", "Bank"), PremiumCatalog.beneficiaryProviders)
        assertFalse(PaymentMethod("ADCB", "AE", "AED", null).enabled)
    }

    @Test fun bilingualDashboardLabelsAndStatusesAreStable() {
        assertEquals("Closer to your family", PremiumCatalog.homeTitle(false))
        assertEquals("আপনার পরিবারের কাছে", PremiumCatalog.homeTitle(true))
        assertEquals("পর্যালোচনাধীন", PremiumCatalog.statusLabel("under_review", true))
        assertEquals("unknown status", PremiumCatalog.statusLabel("unknown_status", false))
    }

    @Test fun apiTransportRejectsNonHttpsOriginsAndPathTraversal() {
        assertThrows(AccountFailure.NotConfigured::class.java) {
            AccountApi(baseUrl = "http://example.test")
                .request("me")
        }
    }
}

package com.globalmoney.uae.demo

import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class DemoMoneyTest {
    @Test fun fixedRateUsesExactDecimalArithmetic() {
        assertEquals("3250.00", DemoMoney.toBdt(BigDecimal("100")).toPlainString())
        assertEquals("0.33", DemoMoney.toBdt(BigDecimal("0.01")).toPlainString())
        assertEquals("3250000.00", DemoMoney.toBdt(BigDecimal("100000")).toPlainString())
    }
    @Test fun acceptsOnlyBoundedPositiveAmountsWithTwoDecimalPlaces() {
        listOf("", "0", "-1", "NaN", "Infinity", "1e3", "100000.01", "1000000", "1.234", "1,000", " 10", ".1").forEach {
            assertNull("Must reject $it", DemoMoney.parseAmount(it))
        }
        listOf("0.01", "1", "99.99", "100000.00").forEach {
            assertNotNull("Must accept $it", DemoMoney.parseAmount(it))
        }
    }
    @Test fun seedHistoryCoversEveryStatusAndHasDemoReferences() {
        assertEquals(DemoStatus.entries.toSet(), sampleTransactions().map { it.status }.toSet())
        assertTrue(sampleTransactions().all { it.id.startsWith("DEMO-") })
    }
}

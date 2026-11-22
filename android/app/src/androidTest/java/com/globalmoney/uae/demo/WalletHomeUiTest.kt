package com.globalmoney.uae.demo

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class WalletHomeUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun cardsNavigateAndBalancesComeFromTheProvidedWallet() {
        val actions = mutableListOf<HomeAction>()
        compose.setContent {
            MaterialTheme {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    WalletHome(WalletAmounts("70.00", "30.00"), null, false, false, {}, { actions.add(it) })
                }
            }

        }
        compose.onNodeWithText("AED 70.00").assertExists()
        compose.onNodeWithText("Reserved balance: AED 30.00").assertExists()
        compose.onNodeWithText("Payouts unavailable").assertExists()
        compose.onNodeWithText("Add Money").performScrollTo().performClick()
        compose.onNodeWithText("Send Money").performScrollTo().performClick()
        compose.onNodeWithText("My Requests").performScrollTo().performClick()
        compose.onNodeWithText("Transaction History").performScrollTo().performClick()
        compose.onNodeWithText("Profile").performScrollTo().performClick()
        compose.onNodeWithText("Support").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(listOf(HomeAction.ADD_MONEY, HomeAction.SEND_MONEY, HomeAction.REQUESTS,
                HomeAction.HISTORY, HomeAction.PROFILE, HomeAction.SUPPORT), actions)
        }
    }

    @Test fun unavailableBalancesAndRateShowDash() {
        compose.setContent {
            MaterialTheme {
                Column { WalletHome(WalletAmounts(null, null), null, false, false, {}, {}) }
            }
        }
        compose.onNodeWithText("—").assertExists()
        compose.onNodeWithText("Reserved balance: —").assertExists()
        compose.onNodeWithText("Exchange rate: —").assertExists()
    }
}

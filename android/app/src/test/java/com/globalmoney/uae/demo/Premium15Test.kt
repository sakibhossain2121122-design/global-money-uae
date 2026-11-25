package com.globalmoney.uae.demo
import org.junit.Assert.*
import org.junit.Test
class Premium15Test {
 @Test fun monetaryInputHasExactPrecisionAndBounds(){
  for(value in listOf("0.01","25.50","100000","100000.00"))assertTrue(value,validAmount(value))
  for(value in listOf("0","-1","NaN","Infinity","1e3","10.001","100000.01","", " 1"))assertFalse(value,validAmount(value))
 }
 @Test fun successfulIsAlwaysLabelledStaging(){assertEquals("Successful (Staging)",PremiumCatalog.statusLabel("successful",false));assertEquals("সফল (স্টেজিং)",PremiumCatalog.statusLabel("successful",true))}
}

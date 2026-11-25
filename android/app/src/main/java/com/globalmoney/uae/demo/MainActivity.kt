package com.globalmoney.uae.demo

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

private val Emerald = Color(0xFF007E63)
private val Navy = Color(0xFF0D283C)
private val Gold = Color(0xFFDCBB72)
private val Mist = Color(0xFFF2F7F4)
private val Ink = Color(0xFF60756E)
private val Palette = lightColorScheme(primary=Emerald, secondary=Navy, tertiary=Gold, background=Mist, surface=Color.White, onSurface=Navy, onBackground=Navy)

class MainActivity : ComponentActivity() {
    private val api=AccountApi()
    private val executor=Executors.newSingleThreadExecutor()
    private val handler=Handler(Looper.getMainLooper())
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        // Release screens are protected. Debug screenshots use synthetic test data only.
        if(!BuildConfig.DEBUG) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent { PremiumApp(api) { work,done -> executor.execute { val result=runCatching(work);handler.post {if(!isDestroyed)done(result)} } } }
    }
    override fun onDestroy(){api.token=null;executor.shutdownNow();handler.removeCallbacksAndMessages(null);super.onDestroy()}
}

@Composable internal fun PremiumApp(api:AccountApi,run:(()->String,(Result<String>)->Unit)->Unit) {
    var bn by rememberSaveable { mutableStateOf(false) }
    fun t(en:String,bengali:String)=if(bn)bengali else en
    var phase by remember {mutableStateOf("Splash")}
    var page by remember {mutableStateOf("Home")}
    var signedIn by remember {mutableStateOf(false)}
    var busy by remember {mutableStateOf(false)}
    var notice by remember {mutableStateOf("")}
    var email by remember {mutableStateOf("")};var password by remember {mutableStateOf("")}
    var name by remember {mutableStateOf("")};var account by remember {mutableStateOf("")};var bank by remember {mutableStateOf("")}
    var subject by remember {mutableStateOf("")};var message by remember {mutableStateOf("")}
    var provider by remember {mutableStateOf("bKash")}
    var amount by remember {mutableStateOf("")};var selected by remember {mutableStateOf("")}
    var key by remember {mutableStateOf(UUID.randomUUID().toString())}
    var rows by remember {mutableStateOf(JSONArray())}
    var methods by remember {mutableStateOf(JSONArray())}
    var banks by remember {mutableStateOf(JSONArray())}
    var overview by remember {mutableStateOf(JSONObject())}
    var historyKind by remember {mutableStateOf("deposit-requests")}
    var ticket by remember {mutableStateOf("")}
    fun clear(){api.token=null;signedIn=false;phase="Login";page="Home";rows=JSONArray();methods=JSONArray();banks=JSONArray();overview=JSONObject();name="";email="";password="";account="";bank="";subject="";message="";amount="";selected="";ticket="";key=UUID.randomUUID().toString()}
    fun call(work:()->String,done:(String)->Unit={}) {
        busy=true;notice=""
        run(work){result->busy=false;result.mapCatching{done(it)}.onFailure{error->
            if(error is AccountFailure.Session)clear()
            notice=when(error){
                is AccountFailure.Session->t("Session expired. Please sign in again.","সেশনের মেয়াদ শেষ। আবার লগইন করুন।")
                is AccountFailure.Network->t("Connection unavailable. Check history before retrying a request.","সংযোগ নেই। আবার জমা দেওয়ার আগে ইতিহাস দেখুন।")
                is AccountFailure.Rejected->t("Request rejected (${error.status}). Check details or refresh.","অনুরোধ প্রত্যাখ্যাত (${error.status})। তথ্য পরীক্ষা করুন।")
                else->t("Staging service unavailable. Please try again later.","স্টেজিং সেবা অনুপলব্ধ। পরে চেষ্টা করুন।")
            }
        }}
    }
    fun loadHome(){page="Home";overview=JSONObject();call({api.request("overview")}){overview=JSONObject(it)}}
    fun navigate(to:String){rows=JSONArray();page=to;selected="";amount="";key=UUID.randomUUID().toString();ticket="";when(to){
        "Home"->loadHome()
        "History"->call({api.request(historyKind)}){rows=JSONArray(it)}
        "Support"->call({api.request("support")}){rows=JSONArray(it)}
        "Profile"->call({api.request("me")}){name=JSONObject(it).getString("name")}
        "AddMoney","Methods"->{methods=JSONArray();call({api.request("staging-methods")}){methods=JSONArray(it)}}
        "Beneficiaries"->{name="";account="";bank="";call({JSONObject().put("people",JSONArray(api.request("beneficiaries"))).put("banks",JSONArray(api.request("payout-banks"))).toString()}){val data=JSONObject(it);rows=data.getJSONArray("people");banks=data.getJSONArray("banks")}}
        "SendMoney"->call({api.request("beneficiaries")}){rows=JSONArray(it)}
    }}
    val scroll=rememberScrollState()
    LaunchedEffect(page,phase){scroll.scrollTo(0)}
    LaunchedEffect(Unit){delay(800);phase="Welcome"}
    val clipboard=LocalClipboardManager.current
    MaterialTheme(colorScheme=Palette) {
        Scaffold(containerColor=Mist,bottomBar={if(signedIn)NavigationBar(containerColor=Color.White){
            listOf(Triple("Home","হোম","⌂"),Triple("History","ইতিহাস","≡"),Triple("Support","সহায়তা","?"),Triple("Profile","প্রোফাইল","○")).forEach{(en,bengali,icon)->NavigationBarItem(selected=page==en,onClick={if(!busy)navigate(en)},enabled=!busy,icon={Text(icon,fontSize=23.sp)},label={Text(t(en,bengali))})}
        }}){padding->
            if(phase=="Splash")Box(Modifier.fillMaxSize().background(Navy),contentAlignment=Alignment.Center){Column(horizontalAlignment=Alignment.CenterHorizontally){Monogram(76);Spacer(Modifier.height(24.dp));Text("GLOBAL MONEY UAE",color=Color.White,fontWeight=FontWeight.Bold,letterSpacing=2.sp);Text("RECONSTRUCTED 1.5.0",color=Gold,fontSize=11.sp)}}
            else Column(Modifier.fillMaxSize().padding(padding)){
                Row(Modifier.fillMaxWidth().background(if(!signedIn)Navy else Color.White).padding(horizontal=22.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically){
                    Monogram(38);Spacer(Modifier.width(12.dp));Column(Modifier.weight(1f)){Text("GLOBAL MONEY",color=if(signedIn)Navy else Color.White,fontWeight=FontWeight.ExtraBold,letterSpacing=1.sp,fontSize=14.sp);Text("UAE  •  RECONSTRUCTED 1.5.0",color=if(signedIn)Ink else Gold,fontSize=9.sp,letterSpacing=1.sp)}
                    TextButton(onClick={bn=!bn},enabled=!busy){Text(if(bn)"English" else "বাংলা",color=if(signedIn)Emerald else Gold)}
                }
                Column(Modifier.weight(1f).verticalScroll(scroll).padding(22.dp),verticalArrangement=Arrangement.spacedBy(17.dp)){
                    if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
                    if(notice.isNotBlank())Surface(color=Color(0xFFFFEDE3),shape=RoundedCornerShape(12.dp)){Text(notice,Modifier.padding(14.dp),color=Color(0xFF8F3F22))}
                    if(!signedIn){when(phase){
                        "Welcome"->{
                            Surface(shape=RoundedCornerShape(28.dp),color=Navy){Column(Modifier.fillMaxWidth().padding(28.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
                                Badge("STAGING  /  স্টেজিং")
                                Text(t("Closer to home.\nEvery step of the way.","দেশের আরও কাছে।\nপ্রতিটি পদক্ষেপে।"),fontSize=36.sp,lineHeight=43.sp,fontWeight=FontWeight.ExtraBold,color=Color.White)
                                Text(t("A considered way to manage your remittance requests from the UAE to Bangladesh.","আমিরাত থেকে বাংলাদেশে অর্থ পাঠানোর অনুরোধ পরিচালনার সহজ উপায়।"),color=Color(0xFFB3CEC8),lineHeight=24.sp)
                                Row(horizontalArrangement=Arrangement.spacedBy(10.dp)){Badge("UAE");Text("→",color=Gold);Badge("BANGLADESH")}
                            }}
                            Heading(t("Built around you","আপনাকে ঘিরেই"),t("Clear requests. One place to stay in control.","স্বচ্ছ অনুরোধ। নিয়ন্ত্রণ এক জায়গায়।"))
                            Panel{Text(t("01   Request with confidence","০১   নিশ্চিন্তে অনুরোধ করুন"),fontWeight=FontWeight.Bold);Text(t("02   Track every staging update","০২   প্রতিটি স্টেজিং আপডেট দেখুন"),fontWeight=FontWeight.Bold);Text(t("03   Get support when you need it","০৩   প্রয়োজনে সহায়তা নিন"),fontWeight=FontWeight.Bold)}
                            Primary(t("Get started","শুরু করুন"),!busy){phase="Register"}
                            OutlinedButton(onClick={phase="Login"},modifier=Modifier.fillMaxWidth()){Text(t("I already have an account","আমার অ্যাকাউন্ট আছে"))}
                        }
                        else->{
                            val registering=phase=="Register"
                            Text(t("YOUR CONNECTION TO HOME","দেশের সাথে আপনার সংযোগ"),color=Emerald,fontSize=11.sp,letterSpacing=2.sp)
                            Heading(t(if(registering)"A fresh start." else "Welcome back.",if(registering)"নতুন শুরু।" else "স্বাগতম।"),t(if(registering)"Create your staging account." else "Sign in to your staging account.",if(registering)"স্টেজিং অ্যাকাউন্ট তৈরি করুন।" else "স্টেজিং অ্যাকাউন্টে লগইন করুন।"))
                            Panel{
                                if(registering)Field(name,{name=it},t("Full name","পুরো নাম"),!busy)
                                Field(email,{email=it},t("Email address","ইমেইল"),!busy,KeyboardType.Email)
                                OutlinedTextField(password,{password=it.take(128)},label={Text(t("Password • 12–128 characters","পাসওয়ার্ড • ১২–১২৮ অক্ষর"))},singleLine=true,enabled=!busy,visualTransformation=PasswordVisualTransformation(),keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password),modifier=Modifier.fillMaxWidth())
                                Primary(t(if(registering)"Create account" else "Sign in",if(registering)"অ্যাকাউন্ট তৈরি করুন" else "লগইন"),!busy&&email.isNotBlank()&&password.length>=12&&(!registering||name.isNotBlank())){
                                    val payload=JSONObject().put("email",email).put("password",password).put("name",name);password=""
                                    call({api.request(if(registering)"auth/register" else "auth/login","POST",payload)}){if(registering){phase="Login";notice=t("If eligible, your account is ready. Please sign in.","উপযুক্ত হলে অ্যাকাউন্ট প্রস্তুত। লগইন করুন।")}else{api.token=JSONObject(it).getString("token");signedIn=true;email="";loadHome()}}
                                }
                            }
                            TextButton(enabled=!busy,onClick={password="";phase=if(registering)"Login" else "Register"}){Text(t(if(registering)"Already registered? Sign in" else "New here? Create an account",if(registering)"অ্যাকাউন্ট আছে? লগইন করুন" else "নতুন? অ্যাকাউন্ট তৈরি করুন"))}
                        }
                    }}else{
                        if(page!in listOf("Home","History","Support","Profile"))TextButton(enabled=!busy,onClick={navigate("Home")}){Text(t("← Back to home","← হোমে ফিরুন"))}
                        when(page){
                            "Home"->{
                                Heading(t("A little closer to home.","দেশের আরও কাছে।"),t("Your money requests, thoughtfully organised.","আপনার অর্থের অনুরোধ, সুন্দরভাবে সাজানো।"))
                                Surface(shape=RoundedCornerShape(24.dp),color=Emerald){Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(Emerald,Color(0xFF064D43)))).padding(26.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
                                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(t("AVAILABLE BALANCE","ব্যালেন্স"),color=Color.White,fontSize=11.sp,letterSpacing=2.sp);Text("STAGING",color=Gold,fontSize=10.sp,fontWeight=FontWeight.Bold)}
                                    Text("—  AED",color=Color.White,fontSize=40.sp,fontWeight=FontWeight.Light)
                                    Text(t("Wallet posting is disabled","ওয়ালেট জমা বন্ধ রয়েছে"),color=Color(0xFFB8D9CD),fontSize=12.sp)
                                }}
                                Panel{Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(t("Exchange rate","বিনিময় হার"),fontWeight=FontWeight.Bold);Text("AED → BDT",color=Emerald,fontSize=12.sp)}
                                    val rate=overview.optJSONObject("rate")
                                    Text(if(rate==null)t("Not configured","কনফিগার করা নেই") else "1 AED = ${rate.optString("value")} BDT",fontSize=22.sp,fontWeight=FontWeight.Bold)
                                    Text(t("Manual staging configuration • not a live market quote","ম্যানুয়াল স্টেজিং রেট • লাইভ বাজার দর নয়"),fontSize=11.sp,color=Ink)
                                }
                                Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){
                                    ActionTile(t("Add Money","অর্থ যোগ"),"+",Modifier.weight(1f),!busy){navigate("AddMoney")}
                                    ActionTile(t("Send Money","অর্থ পাঠান"),"↗",Modifier.weight(1f),!busy){navigate("SendMoney")}
                                }
                                Heading(t("Made for your journey","আপনার যাত্রার জন্য"),t("From the UAE to Bangladesh","আমিরাত থেকে বাংলাদেশে"))
                                Panel{Text(t("UAE payment categories","আমিরাতের পেমেন্ট বিভাগ"),fontWeight=FontWeight.Bold);Text(PremiumCatalog.uaePaymentMethods.joinToString("  ·  "),color=Ink,lineHeight=23.sp);OutlinedButton(enabled=!busy,onClick={navigate("Methods")}){Text(t("View server-controlled methods","সার্ভার নিয়ন্ত্রিত পদ্ধতি দেখুন"))}}
                                Panel{Text(t("Bangladesh payout categories","বাংলাদেশের পেআউট বিভাগ"),fontWeight=FontWeight.Bold);Text(PremiumCatalog.beneficiaryProviders.joinToString("  ·  "),color=Ink);TextButton(enabled=!busy,onClick={navigate("Beneficiaries")}){Text(t("Manage beneficiaries →","প্রাপক পরিচালনা →"))}}
                                OutlinedButton(enabled=!busy,onClick={loadHome()},modifier=Modifier.fillMaxWidth()){Text(t("Refresh dashboard","ড্যাশবোর্ড রিফ্রেশ"))}
                            }
                            "Methods","AddMoney"->{
                                Heading(t(if(page=="Methods")"Payment methods" else "Add Money",if(page=="Methods")"পেমেন্ট পদ্ধতি" else "অর্থ যোগ করুন"),t("Server-controlled • synthetic requests only","সার্ভার নিয়ন্ত্রিত • শুধু পরীক্ষামূলক অনুরোধ"))
                                if(methods.length()==0)Empty(t("No methods loaded. Refresh to try again.","কোনো পদ্ধতি আসেনি। আবার রিফ্রেশ করুন।"))
                                for(i in 0 until methods.length()){
                                    val m=methods.getJSONObject(i);val enabled=m.optBoolean("staging_enabled",false)
                                    Panel{Row(verticalAlignment=Alignment.CenterVertically){NeutralMark(m.optString("name"));Spacer(Modifier.width(12.dp));Column(Modifier.weight(1f)){Text(m.optString("name"),fontWeight=FontWeight.Bold);Text(if(enabled)t("Staging requests enabled","স্টেজিং অনুরোধ চালু") else t("Unavailable","অনুপলব্ধ"),fontSize=12.sp,color=Ink)};if(page=="AddMoney")RadioButton(selected=selected==m.optString("id"),enabled=enabled&&!busy,onClick={selected=m.getString("id")})}}
                                }
                                if(page=="AddMoney"){
                                    Field(amount,{amount=it.take(12)},t("Amount in AED","AED পরিমাণ"),!busy,KeyboardType.Decimal)
                                    Primary(t("Submit staging request","স্টেজিং অনুরোধ জমা দিন"),!busy&&selected.isNotBlank()&&validAmount(amount)){
                                        val payload=JSONObject().put("amountAed",amount).put("paymentMethodId",selected).put("receiptFixtureKey","synthetic:$key").put("idempotencyKey","deposit-$key")
                                        call({api.request("deposit-requests","POST",payload)}){amount="";selected="";historyKind="deposit-requests";navigate("History")}
                                    }
                                }
                                TextButton(enabled=!busy,onClick={navigate(page)}){Text(t("Refresh methods","পদ্ধতি রিফ্রেশ"))}
                            }
                            "SendMoney"->{
                                Heading(t("Send Money","অর্থ পাঠান"),t("Create a staging request. No funds will move.","স্টেজিং অনুরোধ করুন। কোনো অর্থ পাঠানো হবে না।"))
                                if(rows.length()==0)Empty(t("Add a beneficiary to begin.","প্রথমে প্রাপক যোগ করুন।"))
                                for(i in 0 until rows.length()){val row=rows.getJSONObject(i);Panel{Row(verticalAlignment=Alignment.CenterVertically){RadioButton(selected=selected==row.optString("id"),enabled=!busy,onClick={selected=row.getString("id")});Column{Text(row.optString("name"),fontWeight=FontWeight.Bold);Text(row.optString("provider"),color=Ink)}}}}
                                TextButton(enabled=!busy,onClick={navigate("Beneficiaries")}){Text(t("Manage beneficiaries","প্রাপক পরিচালনা"))}
                                Field(amount,{amount=it.take(12)},t("Amount in AED","AED পরিমাণ"),!busy,KeyboardType.Decimal)
                                Primary(t("Submit staging request","স্টেজিং অনুরোধ জমা দিন"),!busy&&selected.isNotBlank()&&validAmount(amount)){
                                    val payload=JSONObject().put("amountAed",amount).put("beneficiaryId",selected).put("idempotencyKey","synthetic:$key")
                                    call({api.request("send-money-requests","POST",payload)}){amount="";selected="";historyKind="send-money-requests";navigate("History")}
                                }
                            }
                            "History"->{
                                Heading(t("Your activity","আপনার কার্যক্রম"),t("Staging requests. Real funds never move.","স্টেজিং অনুরোধ। প্রকৃত অর্থ পাঠানো হয় না।"))
                                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){listOf("deposit-requests" to t("Add Money","অর্থ যোগ"),"send-money-requests" to t("Send Money","অর্থ পাঠান")).forEach{(route,label)->FilterChip(selected=historyKind==route,onClick={if(!busy){historyKind=route;navigate("History")}},label={Text(label)})}}
                                if(rows.length()==0)Empty(t("No requests to show.","কোনো অনুরোধ নেই।"))
                                for(i in 0 until rows.length()){val row=rows.getJSONObject(i);Panel{
                                    Text(row.optString("amount_aed","—")+" AED",fontSize=25.sp,fontWeight=FontWeight.Bold)
                                    Text(PremiumCatalog.statusLabel(row.optString("status"),bn),color=Emerald,fontWeight=FontWeight.Bold)
                                    Text(t("Request ID: ","অনুরোধ আইডি: ")+row.optString("id"),fontSize=11.sp,color=Ink)
                                    if(!row.isNull("transaction_reference")&&row.optString("transaction_reference").isNotBlank()){
                                        val trx=row.getString("transaction_reference");Text("TRX ID: $trx",fontWeight=FontWeight.Bold)
                                        OutlinedButton(onClick={clipboard.setText(AnnotatedString(trx));notice=t("TRX ID copied.","TRX আইডি কপি হয়েছে।")}){Text(t("Copy TRX ID","TRX আইডি কপি"))}
                                    }
                                }}
                                OutlinedButton(enabled=!busy,onClick={navigate("History")},modifier=Modifier.fillMaxWidth()){Text(t("Refresh history","ইতিহাস রিফ্রেশ"))}
                            }
                            "Beneficiaries"->{
                                Heading(t("People who matter","আপনজনেরা"),t("Manage your Bangladesh recipients.","বাংলাদেশের প্রাপক পরিচালনা করুন।"))
                                Panel{
                                    PremiumCatalog.beneficiaryProviders.forEach{value->Row(verticalAlignment=Alignment.CenterVertically){RadioButton(selected=provider==value,enabled=!busy,onClick={provider=value});Text(value)}}
                                    Field(name,{name=it},t("Recipient name","প্রাপকের নাম"),!busy)
                                    Field(account,{account=it.take(40)},t("Account number • test data only","অ্যাকাউন্ট নম্বর • শুধু পরীক্ষার তথ্য"),!busy)
                                    if(provider=="Bank"){
                                        Text(t("Available Bangladesh banks","বাংলাদেশের উপলব্ধ ব্যাংক"),fontWeight=FontWeight.Bold)
                                        if(banks.length()==0)Text(t("No banks configured by Admin.","অ্যাডমিন কোনো ব্যাংক কনফিগার করেননি।"),color=Ink)
                                        for(i in 0 until banks.length()){val b=banks.getJSONObject(i);Row(verticalAlignment=Alignment.CenterVertically){RadioButton(selected=bank==b.optString("name"),enabled=!busy,onClick={bank=b.getString("name")});Text(b.optString("name"))}}
                                    }
                                    Primary(t("Save beneficiary","প্রাপক সংরক্ষণ"),!busy&&name.isNotBlank()&&account.length>=6&&(provider!="Bank"||bank.isNotBlank())){
                                        val payload=JSONObject().put("name",name).put("account",account).put("provider",provider).put("bank",bank)
                                        call({api.request("beneficiaries","POST",payload)}){navigate("Beneficiaries")}
                                    }
                                }
                                for(i in 0 until rows.length()){val row=rows.getJSONObject(i);Panel{Text(row.optString("name"),fontWeight=FontWeight.Bold);Text(row.optString("provider"),color=Ink);TextButton(enabled=!busy,onClick={call({api.request("beneficiaries/"+row.getString("id"),"DELETE")}){navigate("Beneficiaries")}}){Text(t("Remove beneficiary","প্রাপক মুছুন"))}}}
                            }
                            "Support"->{
                                Heading(t("We're here for you.","আমরা আপনার পাশে।"),t("Never share passwords, banking details or identity documents.","পাসওয়ার্ড, ব্যাংকের তথ্য বা পরিচয়পত্র দেবেন না।"))
                                if(ticket.isBlank()){
                                    Panel{Field(subject,{subject=it},t("Subject","বিষয়"),!busy);Field(message,{message=it},t("How can we help?","কীভাবে সাহায্য করতে পারি?"),!busy)
                                    Primary(t("Send message","বার্তা পাঠান"),!busy&&subject.isNotBlank()&&message.isNotBlank()){
                                        val payload=JSONObject().put("subject",subject).put("message",message);call({api.request("support","POST",payload)}){subject="";message="";navigate("Support")}
                                    }}
                                    for(i in 0 until rows.length()){val row=rows.getJSONObject(i);Panel{Text(row.optString("subject"),fontWeight=FontWeight.Bold);Text(row.optString("status"),color=Ink);TextButton(enabled=!busy,onClick={ticket=row.getString("id");rows=JSONArray();call({api.request("support/$ticket/replies")}){rows=JSONArray(it)}}){Text(t("Open conversation","কথোপকথন খুলুন"))}}}
                                }else{
                                    for(i in 0 until rows.length()){val row=rows.getJSONObject(i);Panel{Text(if(row.optString("role")=="admin")t("Support team","সহায়তা দল") else t("You","আপনি"),color=Emerald,fontWeight=FontWeight.Bold);Text(row.optString("message"))}}
                                    Field(message,{message=it},t("Reply","উত্তর"),!busy)
                                    Primary(t("Send reply","উত্তর পাঠান"),!busy&&message.isNotBlank()){val payload=JSONObject().put("message",message);call({api.request("support/$ticket/replies","POST",payload);api.request("support/$ticket/replies")}){rows=JSONArray(it);message=""}}
                                    TextButton(onClick={navigate("Support")},enabled=!busy){Text(t("All tickets","সব টিকিট"))}
                                }
                            }
                            "Profile"->{
                                Heading(t("Your space.","আপনার জায়গা।"),t("Keep your account details up to date.","অ্যাকাউন্টের তথ্য আপডেট রাখুন।"))
                                Panel{Field(name,{name=it},t("Full name","পুরো নাম"),!busy);Primary(t("Save profile","প্রোফাইল সংরক্ষণ"),!busy&&name.isNotBlank()){val payload=JSONObject().put("name",name);call({api.request("me","PATCH",payload)}){notice=t("Profile updated.","প্রোফাইল আপডেট হয়েছে।")}}}
                                Panel{Text(t("Identity verification","পরিচয় যাচাই"),fontWeight=FontWeight.Bold);Text(t("Unavailable. No identity documents are accepted.","অনুপলব্ধ। কোনো পরিচয়পত্র গ্রহণ করা হয় না।"),color=Ink)}
                                OutlinedButton(enabled=!busy,onClick={call({api.request("auth/logout","POST",JSONObject())}){clear()}},modifier=Modifier.fillMaxWidth()){Text(t("Sign out","লগআউট"))}
                            }
                        }
                    }
                    Surface(shape=RoundedCornerShape(12.dp),color=Color(0xFFE7EEE8)){Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                        Text(t("RECONSTRUCTED 1.5.0 • STAGING","পুনর্নির্মিত ১.৫.০ • স্টেজিং"),fontSize=10.sp,fontWeight=FontWeight.ExtraBold,color=Emerald,letterSpacing=1.sp)
                        Text(t("Service not yet available. Real payments, wallet credit, payouts and identity uploads are disabled.","সেবাটি এখনও চালু হয়নি। প্রকৃত পেমেন্ট, ওয়ালেট জমা, পেআউট ও পরিচয়পত্র আপলোড বন্ধ।"),fontSize=11.sp,color=Ink,lineHeight=17.sp)
                    }}
                    Spacer(Modifier.height(6.dp))
                }
            }
        }
    }
}

internal fun validAmount(value:String)=value.matches(Regex("[0-9]{1,6}(\\.[0-9]{1,2})?"))&&(value.toBigDecimalOrNull()?.let{it>=java.math.BigDecimal("0.01")&&it<=java.math.BigDecimal("100000")}?:false)
@Composable private fun Monogram(size:Int){Box(Modifier.size(size.dp).background(Gold,RoundedCornerShape((size/3).dp)),contentAlignment=Alignment.Center){Text("GM",fontSize=(size/2.8).sp,fontWeight=FontWeight.Black,color=Navy)}}
@Composable private fun Badge(text:String){Surface(color=Color(0xFF214336),shape=RoundedCornerShape(30.dp)){Text(text,Modifier.padding(horizontal=12.dp,vertical=7.dp),color=Gold,fontSize=10.sp,fontWeight=FontWeight.Bold,letterSpacing=1.sp)}}
@Composable private fun NeutralMark(name:String){Box(Modifier.size(40.dp).background(Mist,CircleShape),contentAlignment=Alignment.Center){Text(name.take(2).uppercase(),color=Emerald,fontWeight=FontWeight.Bold)}}
@Composable private fun Heading(title:String,subtitle:String){Column(verticalArrangement=Arrangement.spacedBy(7.dp)){Text(title,fontSize=28.sp,lineHeight=35.sp,fontWeight=FontWeight.ExtraBold,color=Navy);Text(subtitle,color=Ink,lineHeight=21.sp,fontSize=13.sp)}}
@Composable private fun Panel(content:@Composable ColumnScope.()->Unit){Surface(shape=RoundedCornerShape(18.dp),color=Color.White,modifier=Modifier.fillMaxWidth(),tonalElevation=1.dp){Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp),content=content)}}
@Composable private fun Primary(label:String,enabled:Boolean,onClick:()->Unit){Button(onClick=onClick,enabled=enabled,shape=RoundedCornerShape(12.dp),contentPadding=PaddingValues(16.dp),modifier=Modifier.fillMaxWidth()){Text(label,fontWeight=FontWeight.Bold)}}
@Composable private fun ActionTile(label:String,symbol:String,modifier:Modifier,enabled:Boolean,onClick:()->Unit){FilledTonalButton(onClick=onClick,enabled=enabled,modifier=modifier.height(96.dp),shape=RoundedCornerShape(18.dp),colors=ButtonDefaults.filledTonalButtonColors(containerColor=Color.White,contentColor=Emerald)){Column(horizontalAlignment=Alignment.CenterHorizontally){Text(symbol,fontSize=30.sp);Text(label,fontWeight=FontWeight.Bold)}}}
@Composable private fun Field(value:String,change:(String)->Unit,label:String,enabled:Boolean=true,type:KeyboardType=KeyboardType.Text){OutlinedTextField(value,{change(it.take(120))},label={Text(label)},singleLine=true,enabled=enabled,shape=RoundedCornerShape(12.dp),keyboardOptions=KeyboardOptions(keyboardType=type),modifier=Modifier.fillMaxWidth())}
@Composable private fun Empty(message:String){Panel{Text(message,color=Ink,modifier=Modifier.padding(vertical=20.dp))}}

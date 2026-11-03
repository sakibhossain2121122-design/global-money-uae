"""Dependency-free checks available even without an Android SDK. Not a Kotlin build."""
from pathlib import Path
import hashlib
import re
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
required = [
    'gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar',
    'gradle/wrapper/gradle-wrapper.properties', 'settings.gradle.kts',
    'build.gradle.kts', 'gradle.properties', 'app/build.gradle.kts',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java/com/globalmoney/uae/demo/MainActivity.kt',
    'app/src/main/java/com/globalmoney/uae/demo/AccountApi.kt',
]
for name in required:
    path = root / name
    assert path.is_file() and path.stat().st_size > 0, f'Required Android file missing: {name}'
for name, expected in {
    'gradlew': '9cbbb4d68ff7fb5211c4d58f598ac9d8664c05fdcd1e5f59b7f2c3ac1ee00af0',
    'gradlew.bat': '0f3ed8f03b50934cb8c48b15a470d5c20a30a5385825e48b55bcc8ea3d8f8e18',
}.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, f'Official wrapper script changed: {name}'
properties = (root / 'gradle/wrapper/gradle-wrapper.properties').read_text()
assert 'distributionUrl=https' + chr(92) + '://services.gradle.org/distributions/gradle-8.9-bin.zip' in properties
assert 'validateDistributionUrl=true' in properties
for xml in (root / 'app/src/main').rglob('*.xml'):
    ET.parse(xml)
def strings(folder):
    return {node.attrib['name']: node.text or '' for node in ET.parse(
        root / f'app/src/main/res/{folder}/strings.xml').getroot()}
en, bn = strings('values'), strings('values-bn')
assert en.keys() == bn.keys(), 'English/Bengali resource mismatch'
for key in en:
    assert sorted(re.findall(r'%\d+\$[sd]', en[key])) == sorted(re.findall(r'%\d+\$[sd]', bn[key])), key
for kotlin in (root / 'app/src/main/java').rglob('*.kt'):
    for key in re.findall(r'R\.string\.(\w+)', kotlin.read_text()):
        assert key in en, f'Missing string: {key}'
manifest = ET.parse(root / 'app/src/main/AndroidManifest.xml').getroot()
assert [p.attrib['{http://schemas.android.com/apk/res/android}name'] for p in manifest.findall('uses-permission')] == ['android.permission.INTERNET']
ns = '{http://schemas.android.com/apk/res/android}'
application = manifest.find('application')
assert application.attrib[ns + 'allowBackup'] == 'false'
assert application.attrib[ns + 'usesCleartextTraffic'] == 'false'
ui = (root / 'app/src/main/java/com/globalmoney/uae/demo/MainActivity.kt').read_text()
assert 'DEMO' not in ui and '2,450' not in ui and 'sampleTransactions' not in ui
assert 'Service not yet available.' in ui and '—' in ui
assert 'বাংলা' in ui
assert application.find('activity').attrib[ns + 'exported'] == 'true'
jar = root / 'gradle/wrapper/gradle-wrapper.jar'
assert hashlib.sha256(jar.read_bytes()).hexdigest() == '498495120a03b9a6ab5d155f5de3c8f0d986a449153702fb80fc80e134484f17'
with zipfile.ZipFile(jar) as archive:
    assert archive.testzip() is None
    assert 'org/gradle/wrapper/GradleWrapperMain.class' in archive.namelist()
print(f'PASS: XML, {len(en)} bilingual strings, Kotlin resource references, manifest, required Android files and official wrapper integrity')

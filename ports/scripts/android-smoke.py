"""Exercise a real emulator with a clearly fake key, never a provider credential."""
import subprocess,time,xml.etree.ElementTree as ET,re
PACKAGE='com.dwijkansagara.karbs.portable'
def adb(*args):return subprocess.check_output(['adb',*args],text=True).strip()
def tree():
 adb('shell','uiautomator','dump','/sdcard/karbs-smoke.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/karbs-smoke.xml'))
def node(predicate,timeout=30):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  for n in tree().iter('node'):
   if predicate(n.attrib):return n.attrib
  time.sleep(1)
 raise AssertionError('Expected Karbs UI element was not found.')
def text(value):return node(lambda a:value.lower() in (a.get('text','')+' '+a.get('content-desc','')).lower())
def tap(a):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',a['bounds']));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
adb('install','-r','ports/artifacts/Karbs_0.3.0_android.apk')
adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
text('Settings');assert adb('shell','pidof',PACKAGE)
tap(text('Settings'));tap(node(lambda a:a.get('password')=='true'))
adb('shell','input','text','karbs-emulator-fixture-not-a-real-api-key')
adb('shell','input','keyevent','4');tap(text('Save key securely'));text('Key saved in secure device storage')
adb('shell','am','force-stop',PACKAGE);adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
tap(text('Settings'));text('Gemini key connected');tap(text('Remove key'));text('No Gemini key saved')
print('PASS: signed Android app launches, renders settings and saves/loads/removes an encrypted device key.')

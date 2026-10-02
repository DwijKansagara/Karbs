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
  adb('shell','input','swipe','300','650','300','300','250')
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
adb('shell','appops','set',PACKAGE,'SYSTEM_ALERT_WINDOW','allow')
adb('shell','pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
for _ in range(4):adb('shell','input','swipe','300','300','300','700','200')
tap(text('Show floating bar'));adb('shell','input','keyevent','3')
tap(text('Floating Karbs'));text('Open Karbs');text('Stop phone actions')
subprocess.check_call(['adb','shell','screencap','-p','/sdcard/karbs-floating.png']);subprocess.check_call(['adb','pull','/sdcard/karbs-floating.png','ports/artifacts/android-floating-smoke.png'])
tap(text('Open Karbs'));text('Settings');tap(text('Hide'))
adb('shell','settings','put','secure','enabled_accessibility_services',PACKAGE+'/'+PACKAGE+'.KarbsAccessibilityService')
adb('shell','settings','put','secure','accessibility_enabled','1');time.sleep(3)
tap(text('Settings'))
for _ in range(4):adb('shell','input','swipe','300','300','300','700','200')
tap(text('Allow Phone Assist for tasks I send'));text('Phone Assist enabled for tasks you send')
print('PASS: signed Android app launches; encrypted key save/load/remove; floating bar over launcher, expand/open/hide controls; opt-in Phone Assist service connection. No live Gemini or physical device was tested.')

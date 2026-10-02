"""Exercise a real emulator with a clearly fake key, never a provider credential."""
import subprocess,time,xml.etree.ElementTree as ET,re,sys,pathlib
PACKAGE='com.dwijkansagara.karbs.portable'
def adb(*args):return subprocess.check_output(['adb',*args],text=True).strip()
WIDTH,HEIGHT=map(int,re.findall(r'(\d+)x(\d+)',adb('shell','wm','size'))[-1])
def visible(a):
 bounds=list(map(int,re.findall(r'\d+',a.get('bounds',''))))
 return len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]>bounds[1] and 0<=(bounds[0]+bounds[2])/2<WIDTH and 24<(bounds[1]+bounds[3])/2<HEIGHT-24
def scroll(up=True):adb('shell','input','swipe',str(WIDTH//2),str(int(HEIGHT*(.8 if up else .45))),str(WIDTH//2),str(int(HEIGHT*(.4 if up else .85))),'250')
def tree():
 adb('shell','uiautomator','dump','/sdcard/karbs-smoke.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/karbs-smoke.xml'))
def failure(kind,error,trace):
 try:
  path=pathlib.Path('ports/qa/android-ci');path.mkdir(parents=True,exist_ok=True)
  path.joinpath('screen.xml').write_text(ET.tostring(tree(),encoding='unicode'))
  adb('shell','screencap','-p','/sdcard/karbs-failure.png');subprocess.check_call(['adb','pull','/sdcard/karbs-failure.png',str(path/'screen.png')])
  path.joinpath('device.log').write_text(adb('logcat','-d','-s','AndroidRuntime:E','RustStdoutStderr:V','chromium:E'))
 except Exception:pass
 sys.__excepthook__(kind,error,trace)
sys.excepthook=failure
def node(predicate,timeout=30):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  try:root=tree()
  except (subprocess.CalledProcessError,ET.ParseError):time.sleep(1);continue
  for n in root.iter('node'):
   if visible(n.attrib) and predicate(n.attrib):return n.attrib
  scroll()
  time.sleep(1)
 raise AssertionError('Expected Karbs UI element was not found.')
def text(value):
 try:return node(lambda a:value.lower() in (a.get('text','')+' '+a.get('content-desc','')).lower())
 except AssertionError:raise AssertionError('Expected UI text: '+value)from None
def tap(a):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',a['bounds']));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
adb('install','-r','ports/artifacts/Karbs_0.3.0_android.apk')
adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
text('Settings');assert adb('shell','pidof',PACKAGE)
tap(text('Settings'));tap(node(lambda a:a.get('password')=='true'))
adb('shell','input','text','karbs-emulator-fixture-not-a-real-api-key')
if any('inputmethod' in n.attrib.get('package','') for n in tree().iter('node')):adb('shell','input','keyevent','4')
tap(text('Save key securely'));text('Key saved in secure device storage')
adb('shell','am','force-stop',PACKAGE);adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
tap(text('Settings'));text('Gemini key connected');tap(text('Remove key'));text('No Gemini key saved')
adb('shell','appops','set',PACKAGE,'SYSTEM_ALERT_WINDOW','allow')
adb('shell','pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
for _ in range(4):scroll(False)
tap(text('Show floating bar'));adb('shell','input','keyevent','3')
tap(text('Floating Karbs'));text('Open Karbs');text('Stop phone actions')
subprocess.check_call(['adb','shell','screencap','-p','/sdcard/karbs-floating.png']);subprocess.check_call(['adb','pull','/sdcard/karbs-floating.png','ports/artifacts/android-floating-smoke.png'])
tap(text('Open Karbs'));text('Settings');tap(text('Hide'))
adb('shell','settings','put','secure','enabled_accessibility_services',PACKAGE+'/'+PACKAGE+'.KarbsAccessibilityService')
adb('shell','settings','put','secure','accessibility_enabled','1');time.sleep(3)
for _ in range(4):scroll(False)
if not any('Connections' in n.attrib.get('text','') for n in tree().iter('node')):tap(text('Settings'))
tap(text('Allow Phone Assist for tasks I send'));text('Phone Assist: screen actions')
tap(text('Test Phone Assist'));text('Phone Assist test passed')
print('PASS: signed Android app launches; encrypted key save/load/remove; floating bar over launcher, expand/open/hide; opt-in Phone Assist connection, native text entry/click/Home/screen inspection. No live Gemini or physical device was tested.')

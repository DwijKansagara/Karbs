"""Exercise a real emulator with a clearly fake key, never a provider credential."""
import subprocess,time,xml.etree.ElementTree as ET,re,sys,pathlib
PACKAGE='com.dwijkansagara.karbs.portable'
DUMP_WINDOWS=False
def adb(*args):return subprocess.check_output(['adb',*args],text=True).strip()
WIDTH,HEIGHT=map(int,re.findall(r'(\d+)x(\d+)',adb('shell','wm','size'))[-1])
def visible(a):
 bounds=list(map(int,re.findall(r'\d+',a.get('bounds',''))))
 return len(bounds)==4 and bounds[2]>bounds[0] and bounds[3]>bounds[1] and 0<=(bounds[0]+bounds[2])/2<WIDTH and 24<(bounds[1]+bounds[3])/2<HEIGHT-24
def scroll(up=True):adb('shell','input','swipe',str(WIDTH//2),str(int(HEIGHT*(.8 if up else .45))),str(WIDTH//2),str(int(HEIGHT*(.4 if up else .85))),'250')
def tree():
 # The Android dump command can return exit code zero with a null root.
 # Remove the last snapshot so Activity restarts cannot reuse stale controls.
 adb('shell','rm','-f','/sdcard/karbs-smoke.xml')
 flags=['--windows'] if DUMP_WINDOWS else []
 result=adb('shell','uiautomator','dump',*flags,'/sdcard/karbs-smoke.xml')
 if 'dumped' not in result.lower():raise subprocess.CalledProcessError(1,'uiautomator dump')
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
 direction=True
 while time.monotonic()<end:
  try:root=tree()
  except (subprocess.CalledProcessError,ET.ParseError):time.sleep(1);continue
  parents={child:parent for parent in root.iter() for child in parent}
  for n in root.iter('node'):
   if not predicate(n.attrib):continue
   bounds=list(map(int,re.findall(r'\d+',n.attrib.get('bounds',''))))
   if len(bounds)!=4 or bounds[2]<=bounds[0] or bounds[3]<=bounds[1]:continue
   x=(bounds[0]+bounds[2])/2;y=(bounds[1]+bounds[3])/2
   parent=parents.get(n);clipped=not visible(n.attrib)
   while parent is not None:
    if parent.attrib.get('scrollable')=='true':
     clip=list(map(int,re.findall(r'\d+',parent.attrib.get('bounds',''))))
     if len(clip)!=4 or not(clip[0]<=x<clip[2] and clip[1]<=y<clip[3]):
      clipped=True
      if len(clip)==4:direction=y>=clip[3]
      break
    parent=parents.get(parent)
   if not clipped:return n.attrib
  scroll(direction)
  time.sleep(1)
 raise AssertionError('Expected Karbs UI element was not found.')
def text(value):
 try:return node(lambda a:value.lower() in (a.get('text','')+' '+a.get('content-desc','')).lower())
 except AssertionError:raise AssertionError('Expected UI text: '+value)from None
def seen(value,timeout=30):
 # Status assertions do not require a clickable, onscreen target. The normal
 # WebView tree retains status nodes when the settings panel is scrolled.
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  try:
   if any(value.lower() in (n.get('text','')+' '+n.get('content-desc','')).lower() for n in tree().iter('node')):return
  except (subprocess.CalledProcessError,ET.ParseError):pass
  time.sleep(1)
 raise AssertionError('Expected Karbs status: '+value)
def tap(a):
 x1,y1,x2,y2=map(int,re.findall(r'\d+',a['bounds']));adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
adb('install','-r','ports/artifacts/Karbs_0.3.0_android.apk')
adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
text('Settings');assert adb('shell','pidof',PACKAGE)
tap(text('Settings'));tap(text('Chat only'));tap(node(lambda a:a.get('password')=='true'))
adb('shell','input','text','karbs-emulator-fixture-not-a-real-api-key')
# WebView accessibility dumps can omit the IME even while it covers buttons.
# Inspect the actual input-method state before Back, so a hidden IME does not
# accidentally dismiss the Activity instead.
ime=adb('shell','dumpsys','input_method')
if re.search(r'(?:mInputShown|isInputViewShown)\s*=\s*true',ime):
 adb('shell','input','keyevent','4');time.sleep(1)
tap(text('Save key securely'));tap(text('Chat only'));seen('Key saved in secure device storage')
print('PASS: encrypted key saved',flush=True)
adb('shell','am','force-stop',PACKAGE);adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
tap(text('Settings'));tap(text('Chat only'));seen('Gemini key connected');tap(text('Remove key'));tap(text('Chat only'));seen('No Gemini key saved')
print('PASS: encrypted key reloaded and removed',flush=True)
adb('shell','appops','set',PACKAGE,'SYSTEM_ALERT_WINDOW','allow')
adb('shell','pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
for _ in range(4):scroll(False)
tap(text('Show floating bar'));time.sleep(1);DUMP_WINDOWS=True;adb('shell','input','keyevent','3')
tap(text('Floating Karbs'));text('Open Karbs');text('Stop phone actions')
subprocess.check_call(['adb','shell','screencap','-p','/sdcard/karbs-floating.png']);subprocess.check_call(['adb','pull','/sdcard/karbs-floating.png','ports/artifacts/android-floating-smoke.png'])
tap(text('Open Karbs'));text('Settings');tap(text('Hide'))
DUMP_WINDOWS=False;time.sleep(1)
tap(text('Chat only'))
print('PASS: floating bar over launcher, expand/open/hide',flush=True)
adb('shell','settings','put','secure','enabled_accessibility_services',PACKAGE+'/'+PACKAGE+'.KarbsAccessibilityService')
adb('shell','settings','put','secure','accessibility_enabled','1');time.sleep(3)
for _ in range(4):scroll(False)
if not any('Connections' in n.attrib.get('text','') for n in tree().iter('node')):tap(text('Settings'))
control=text('Allow Phone Assist for tasks I send');time.sleep(1);tap(control);tap(text('Phone Assist: screen actions'))
control=text('Test Phone Assist');time.sleep(1);tap(control)
# The shell dump tool temporarily suppresses other Accessibility services.
# Leave Karbs's own service uninterrupted while its real action probe runs.
time.sleep(5);text('Phone Assist test passed')
print('PASS: signed Android app launches; encrypted key save/load/remove; floating bar over launcher, expand/open/hide; opt-in Phone Assist connection, native text entry/click/Home/screen inspection. No live Gemini or physical device was tested.')

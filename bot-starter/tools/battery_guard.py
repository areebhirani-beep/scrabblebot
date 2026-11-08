"""Pause only our offline comparison below30% battery; resume on AC power."""
import fcntl,os,pathlib,re,signal,subprocess,time,json
state=pathlib.Path(__file__).resolve().parents[1]/'.runtime-odysseus'
lock=(state/'power.lock').open('a')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('Power guard already running')
(state/'power.pid').write_text(str(os.getpid()))
while True:
 try:
  text=subprocess.check_output(['pmset','-g','batt'],text=True)
  match=re.search(r'(\d+)%;',text);level=int(match[1]) if match else None;ac='AC Power' in text
  paused=(state/'offline-paused').exists()
  active=False
  file=state/'comparison.pid'
  if file.exists():
   pid=int(file.read_text());check=subprocess.run(['ps','-p',str(pid),'-o','args='],capture_output=True,text=True)
   active=check.returncode==0 and 'compare_share.py' in check.stdout and os.getpgid(pid)==pid
   if active and not ac and level is not None and level<30 and not paused:
    os.killpg(pid,signal.SIGSTOP);(state/'offline-paused').write_text('Offline search paused below30% battery; live runner active.\n');paused=True
   elif active and paused and (ac or level is not None and level>=35):
    os.killpg(pid,signal.SIGCONT);(state/'offline-paused').unlink(missing_ok=True);paused=False
  (state/'power.json').write_text(json.dumps({'batteryPercent':level,'acPower':ac,'offlineComparisonActive':active,'offlinePaused':paused,'liveRunnerUnaffected':True,'updatedEpoch':time.time()})+'\n')
 except Exception as error:(state/'power-error.txt').write_text(type(error).__name__+'\n')
 time.sleep(20)

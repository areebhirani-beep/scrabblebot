"""Restart only our locked supervisor, at a completed-match boundary."""
import pathlib,subprocess,signal,os,time,re
root=pathlib.Path(__file__).resolve().parents[1];os.chdir(root)
state=root/'.runtime-odysseus';log=state/'live.log'
text=log.read_text();ended=list(re.finditer(r'match (\d+) ended:',text));watching=list(re.finditer(r'watching match (\d+) \(Running',text));baseline=len(ended)
print('Waiting for a safe boundary after',baseline,'completed local matches',flush=True)
if watching and (not ended or watching[-1].start()>ended[-1].start()):
 deadline=time.monotonic()+140
 while time.monotonic()<deadline:
  if len(re.findall(r'match \d+ ended:',log.read_text()))>baseline:break
  time.sleep(.2)
 else:raise SystemExit('No safe boundary found; current runner left untouched')
pid=int((state/'supervisor.pid').read_text());os.kill(pid,signal.SIGTERM)
for attempt in range(100):
 if not (state/'supervisor.pid').exists():break
 time.sleep(.1)
else:raise SystemExit('Old supervisor did not exit; second launch refused')
with log.open('ab',buffering=0) as output:
 process=subprocess.Popen(['python3','-I','tools/supervise_odysseus.py'],stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
 subprocess.Popen(['caffeinate','-i','-w',str(process.pid)],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
print('Restarted sole supervisor',process.pid,flush=True)

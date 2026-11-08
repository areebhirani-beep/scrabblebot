"""Single local Odysseus runner; shared token never enters argv or logs."""
import fcntl,io,json,os,pathlib,shutil,signal,subprocess,tarfile,time
ROOT=pathlib.Path(__file__).resolve().parents[1]; os.chdir(ROOT)
state=ROOT/'.runtime-odysseus'; state.mkdir(exist_ok=True)
lock=(state/'runner.lock').open('w')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('An Odysseus supervisor already runs on this computer.')
(state/'supervisor.pid').write_text(str(os.getpid()))
child=None; stopping=False

def frozen_source(commit):
 release=state/'releases'/commit
 ready=release/'ready'
 if not ready.exists():
  release.mkdir(parents=True,exist_ok=True)
  archive=subprocess.check_output(['git','-C',str(ROOT.parent),'archive',commit,'bot-starter/src','bot-starter/package.json','spacetimedb/wordlist.txt'])
  with tarfile.open(fileobj=io.BytesIO(archive),mode='r:') as bundle:
   for member in bundle.getmembers():
    path=release/member.name
    if member.isdir():path.mkdir(parents=True,exist_ok=True)
    elif member.isfile():
     path.parent.mkdir(parents=True,exist_ok=True)
     with bundle.extractfile(member) as src:path.write_bytes(src.read())
  shutil.copytree(ROOT/'src/module_bindings',release/'bot-starter/src/module_bindings',dirs_exist_ok=True)
  (release/'bot-starter/node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
  ready.touch()
 return release/'bot-starter/src/index.ts'


def stop(signum,frame):
 global stopping
 stopping=True
 if child and child.poll() is None:child.terminate()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
env=os.environ.copy();env.update(BOT_NAME='odysseus',STDB_HOST='https://maincloud.spacetimedb.com',STDB_DB='scrabblebot',BRAIN='adv')
env.pop('BOT_TOKEN',None);env.pop('BOT_NONCE',None)
fails=0
try:
 while not stopping:
  started=time.monotonic()
  commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
  entry=frozen_source(commit)
  print(time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'starting Odysseus source',commit,flush=True)
  if stopping:break
  child=subprocess.Popen(['node','--max-old-space-size=512','--import','tsx',str(entry)],env=env)
  (state/'child.pid').write_text(str(child.pid))
  code=child.wait()
  print('runner exit',code,flush=True)
  if stopping:break
  fails=0 if time.monotonic()-started>120 else fails+1
  if fails==10:print('Repeated startup/network failures; continuing with30secondbackoff.',flush=True)
  for pause in range(2*min(30,2**min(fails,5))):
   if stopping:break
   time.sleep(.5)
finally:
 if child and child.poll() is None:
  child.terminate()
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill();child.wait()
 for name in ('supervisor.pid','child.pid'):(state/name).unlink(missing_ok=True)
 fcntl.flock(lock,fcntl.LOCK_UN)

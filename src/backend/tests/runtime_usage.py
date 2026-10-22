"""Real local runtime usage acceptance. No provider prompts or production endpoints."""
import concurrent.futures,json,os,pathlib,sqlite3,subprocess,sys,time,urllib.request,urllib.error,uuid
ROOT=pathlib.Path(__file__).resolve().parents[3]
OUT=pathlib.Path(os.environ['AE_TEST_OUTPUT']).resolve();OUT.mkdir(parents=True,exist_ok=True)
BINARY=pathlib.Path(os.environ['AE_TEST_BINARY']).resolve()
PORT=int(os.environ.get('AE_TEST_PORT','18809'));BASE=f'http://127.0.0.1:{PORT}'
CODEX=os.environ['AE_TEST_CODEX'];LEGACY=os.environ.get('AE_TEST_LEGACY_BINARY')
ORG=OUT/'org';WORK=OUT/'workdir';WORK.mkdir();(WORK/'.env').mkdir();(WORK/'README.md').write_text('# Usage acceptance\n',encoding='utf-8')
checks=[];children=[];logs=[];http=[];owner=''
def check(name,ok):
 assert ok,name
 checks.append({'check':name,'passed':True});print('PASS '+name,flush=True)
def call(path,body=None,method=None,credential=None,expected=200):
 headers={'Origin':BASE,'Authorization':'Bearer '+(credential if credential is not None else owner)}
 data=None if body is None else json.dumps(body).encode()
 if data:headers['Content-Type']='application/json'
 req=urllib.request.Request(BASE+'/api'+path,data=data,headers=headers,method=method)
 try:r=urllib.request.urlopen(req,timeout=45)
 except urllib.error.HTTPError as e:r=e
 with r:
  http.append({'path':path,'method':method or ('POST' if data else 'GET'),'status':r.status})
  raw=r.read();assert r.status==expected,f'{path}: {r.status} '+raw.decode()[:200]
  return json.loads(raw)
def wait(fn,seconds=100):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:value=fn()
  except (OSError,urllib.error.URLError):value=None
  if value:return value
  time.sleep(.5)
 raise TimeoutError('Local usage acceptance deadline')
def spawn(binary,args,env,name):
 f=(OUT/name).open('w',encoding='utf-8');logs.append(f)
 p=subprocess.Popen([str(binary),*args],cwd=OUT,env=env,stdout=f,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0);children.append(p);return p
ENV={k:v for k,v in os.environ.items() if not k.startswith('AE_')};ENV.update(AE_PUBLIC_URL=BASE,AE_OPENCODE=str(OUT/'missing-opencode'),AE_ANTIGRAVITY=os.environ.get('AE_TEST_ANTIGRAVITY',str(OUT/'missing-agy')))

def create_worker(binary,name):
 reg=call('/runtimes',{'name':name});env=ENV.copy();env.update(AE_CODEX=CODEX,AE_ENROLLMENT_TOKEN=reg['enrollment_token'])
 state=OUT/name
 p=spawn(binary,['--worker','--controller',BASE,'--worker-state',str(state),'--worker-root',str(WORK)],env,name+'.log')
 runtime=wait(lambda:next((r for r in call('/runtimes') if r['id']==reg['id'] and r.get('online') and r.get('capabilities',{}).get('codex')),None),120)
 return runtime,p,state

def usage(group,rid=None):
 mid=rid or str(uuid.uuid4());payload={'id':mid,'group_id':group,'side_chat_id':None,'body':'/usage','recipients':[],'reply_to':None,'artifacts':[]}
 start=time.monotonic()
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  accepted=list(pool.map(lambda _:call('/messages',payload),range(3)))
 assert all(message['id']==mid for message in accepted),'Concurrent usage acceptance identity'
 elapsed=time.monotonic()-start
 report=wait(lambda:next((m['usage_report'] for m in call('/groups/'+group+'/messages') if (m.get('usage_report') or {}).get('request_id')==mid and m['usage_report']['state']!='pending'),None),150)
 return payload,report,elapsed

try:
 env=ENV.copy();env['CODEX_HOME']=str(OUT/'no-controller-auth')
 controller=spawn(BINARY,['--org',str(ORG),'--port',str(PORT),'--bind','127.0.0.1','--frontend',str(ROOT/'src/frontend/dist'),'--codex',str(OUT/'missing-controller-codex')],env,'controller.log')
 wait(lambda:call('/health'));owner=(ORG/'.state/owner.key').read_text().strip()
 call('/messages',{'id':str(uuid.uuid4()),'group_id':'general','body':'/usage','recipients':[],'artifacts':[]},credential='',expected=401)
 check('Unauthenticated usage is rejected before acceptance',not call('/groups/general/messages'))
 modern,worker,modern_state=create_worker(BINARY,'modern-worker')
 check('New worker advertises versioned usage',modern['capabilities']['read_operations']['usage']==1)
 workspace=call('/workspaces/probe',{'runtime_id':modern['id'],'path':str(WORK)})['workspace']
 initial=call('/state');template=initial['agents'][0]
 def agent(name,harness,runtime,workdir):
  catalog=runtime['capabilities'][harness]
  a=dict(template);a.update(id='',name=name,project_id=None,reports_to=None,harness=harness,model=catalog['model'],reasoning=catalog.get('reasoning',''),workdir=workdir,runtime_id=runtime['id'],permission='read-only',timeout_seconds=30,enabled=True,deleted_at=None,agents_md='',instructions='Acceptance metadata only. Never execute a prompt.')
  return call('/agents',a)
 modern_agent=agent('Modern Codex','codex',modern,workspace)
 # Two enabled Codex agents share one source; disabled and out-of-project agents do not add targets.
 duplicate=agent('Duplicate Codex','codex',modern,workspace)
 members=[modern_agent,duplicate]
 if modern['capabilities'].get('antigravity'):members.append(agent('AGY quota','antigravity',modern,workspace))
 legacy_id=None
 if LEGACY:
  old,oldworker,_=create_worker(pathlib.Path(LEGACY),'legacy-worker');legacy_id=old['id']
  oldws=call('/workspaces/probe',{'runtime_id':old['id'],'path':str(WORK)})['workspace']
  oldagent=agent('Old Codex','codex',old,oldws);members.append(oldagent)
 project={'id':'','name':'Usage project','description':'Local metadata acceptance','member_ids':None,'human_ids':None,'project':{'workdir':workspace,'members':[{'agent_id':a['id'],'manager_id':None} for a in members]},'scope_levels':None,'chat_lead_id':None,'archived_at':None,'deleted_at':None}
 project=call('/groups',project)
 sentinel=spawn(pathlib.Path(sys.executable),['-c','import time; time.sleep(120)'],ENV,'unrelated-process.log')
 payload,report,elapsed=usage(project['id'])
 check('Usage helper leaves unrelated process alive',sentinel.poll() is None)
 sentinel.terminate();sentinel.wait(15)
 command=f"Get-CimInstance Win32_Process -Filter 'ParentProcessId = {worker.pid}' | Where-Object {{ $_.Name -eq 'codex.exe' -and $_.CommandLine -match 'app-server' }} | Select-Object -ExpandProperty ProcessId"
 owned=subprocess.run([str(pathlib.Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'),'-NoProfile','-Command',command],capture_output=True,text=True,check=True)
 check('Completed usage helper has terminated its owned Codex process',not owned.stdout.strip())
 check('Acceptance returns before native inspection',elapsed<5)
 wire=json.dumps(report).lower()
 check('Usage response excludes credential keys and instructions',all(value not in wire for value in ['access_token','refresh_token','id_token','authorization','auth.json','acceptance metadata only']))
 check('Project inheritance deduplicates runtime/harness sources',len(report['sources'])==len({a['harness'] for a in members}) and all(s['runtime_id']==modern['id'] for s in report['sources']))
 codex=next(s for s in report['sources'] if s['harness']=='codex')
 check('Real worker-native account limits returned without controller Codex',codex['status']=='complete' and len(codex['buckets'])>0)
 if any(s['harness']=='antigravity' for s in report['sources']):check('Antigravity quota is explicitly unavailable',next(s for s in report['sources'] if s['harness']=='antigravity')['code']=='quota_unavailable')
 def jobs():
  with sqlite3.connect('file:'+str(ORG/'.state/app.sqlite3')+'?mode=ro',uri=True) as db:return db.execute("select count(*) from fleet_jobs where json_extract(request,'$.op')='usage'").fetchone()[0]
 before=jobs();check('Concurrent first acceptance starts exactly one native inspection',before==1);call('/messages',payload);call('/messages',payload)
 check('Same request ID never repeats native inspection',jobs()==before)
 messages=call('/groups/'+project['id']+'/messages')
 check('Request and result persist exactly once',sum(m['id']==payload['id'] for m in messages)==1 and sum((m.get('usage_report') or {}).get('request_id')==payload['id'] for m in messages)==1)
 if legacy_id:
  _,general,_=usage('general');oldsource=next(s for s in general['sources'] if s['runtime_id']==legacy_id)
  check('Old worker upgrade result is attributed without fallback',oldsource['code']=='upgrade_required')
  with sqlite3.connect('file:'+str(ORG/'.state/app.sqlite3')+'?mode=ro',uri=True) as db:
   check('No unknown usage operation reaches old worker',db.execute("select count(*) from fleet_jobs where runtime=? and json_extract(request,'$.op')='usage'",(legacy_id,)).fetchone()[0]==0)
  oldworker.terminate();oldworker.wait(15)
 worker.terminate();worker.wait(15)
 wait(lambda:not next(r for r in call('/runtimes') if r['id']==modern['id'])['online'],45)
 _,offline,_=usage(project['id'])
 check('Offline sources do not query controller accounts',all(s['code']=='offline' for s in offline['sources']))
 check('Usage does not load project environment', (WORK/'.env').is_dir())
 with sqlite3.connect('file:'+str(ORG/'.state/app.sqlite3')+'?mode=ro',uri=True) as db:check('No provider or terminal task created',db.execute('select count(*) from runs').fetchone()[0]==0 and db.execute('select count(*) from terminal_runs').fetchone()[0]==0)
 with sqlite3.connect('file:'+str(ORG/'.state/app.sqlite3')+'?mode=ro',uri=True) as db:
  operations=[{'id':row[0],'runtime_id':row[1],'state':row[2],'done':bool(row[3])} for row in db.execute("select id,runtime,state,done from fleet_jobs where json_extract(request,'$.op')='usage'")]
 (OUT/'receipt.json').write_text(json.dumps({'checks':checks,'http':http,'read_operations':operations,'project':project['id'],'source_report':report,'offline_report':offline,'production_access':False,'provider_tasks':0},indent=2),encoding='utf-8')
 if os.environ.get('AE_TEST_BROWSER')=='1':
  be=ENV.copy();be.update(AE_TEST_URL=BASE,AE_TEST_ORG=str(ORG),AE_TEST_OUTPUT=str(OUT/'browser'))
  subprocess.run(['node',str(ROOT/'src/frontend/tests/runtime-usage-feedback.mjs')],cwd=ROOT/'src/frontend',env=be,check=True,timeout=600)
 print(str(len(checks))+' real usage checks passed',flush=True)
finally:
 for p in reversed(children):
  if p.poll() is None:
   p.terminate()
   try:p.wait(15)
   except subprocess.TimeoutExpired:p.kill();p.wait()
 for log in logs:log.close()

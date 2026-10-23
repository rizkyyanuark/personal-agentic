"""Real local Synapse/controller acceptance. Never connects to production or dispatches agents.

Set AE_TEST_BINARY to a native built executable and AE_TEST_OUTPUT to a fresh ignored
folder. Docker Desktop and installed Chrome are required. A loopback forwarding proxy
only interrupts the external Synapse response boundary; it never fabricates an account.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import hmac
import http.client
import http.server
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

repo = Path(__file__).resolve().parents[3]
root = Path(os.environ['AE_TEST_OUTPUT']).resolve()
binary = Path(os.environ['AE_TEST_BINARY']).resolve()
assert not root.exists(), 'Use a new disposable output directory for each execution'
root.mkdir(parents=True)
org = root/'org'
port = int(os.environ.get('AE_TEST_PORT','18811'))
base = f'http://127.0.0.1:{port}'
synapse_port=port+1; proxy_port=port+2
matrix = f'http://127.0.0.1:{synapse_port}'
server='invite.test'
name=f'personal-agentic-matrix-onboarding-test-{port}'
image='ghcr.io/element-hq/synapse:v1.161.0'
checks=[]
all_secrets=[]
controller=None
controller_log=None
created_container=False
shared=secrets.token_hex(32)
all_secrets.append(shared)
secret_file=root/'registration.secret'
secret_file.write_text(shared)
if os.name=='nt':
 subprocess.run(['icacls',str(root),'/inheritance:r','/grant:r',os.environ.get('USERNAME','rizky')+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],check=True,capture_output=True)
else: secret_file.chmod(0o600)

def request(url,body=None,method=None,headers=None,timeout=35):
 data=None if body is None else json.dumps(body).encode()
 req=urllib.request.Request(url,data=data,method=method,headers={'Content-Type':'application/json',**(headers or {})})
 try:
  with urllib.request.urlopen(req,timeout=timeout) as r:
   raw=r.read()
   value=json.loads(raw or b'{}') if 'json' in r.headers.get('Content-Type','') else raw.decode(errors='replace')
   return r.status,value,dict(r.headers)
 except urllib.error.HTTPError as e:
  raw=e.read()
  try: value=json.loads(raw)
  except ValueError:value={"error":"non-JSON upstream error"}
  return e.code,value,dict(e.headers)

def check(label,condition=True):
 assert condition,label
 checks.append({'check':label,'passed':True})
 print('PASS',label,flush=True)

def health(url):
 for _ in range(90):
  try:
   if request(url,timeout=2)[0]==200:return
  except OSError:pass
  time.sleep(1)
 raise AssertionError('Local service health timeout')

proxy_state={'drop':None,'block':None,'registrations':0,'logouts':0,'offline':False}
entered=threading.Event();release=threading.Event()
class Forward(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
 def do_PUT(self):self.forward()
 def forward(self):
  body=self.rfile.read(int(self.headers.get('Content-Length','0')))
  if proxy_state['offline']:
   self.close_connection=True;return
  conn=http.client.HTTPConnection('127.0.0.1',synapse_port,timeout=35)
  headers={k:v for k,v in self.headers.items() if k.lower() not in ['host','connection','content-length']}
  try:
   conn.request(self.command,self.path,body=body or None,headers=headers)
   response=conn.getresponse();data=response.read();status=response.status
   if self.command=='POST' and self.path=='/_synapse/admin/v1/register':
    proxy_state['registrations']+=1
    username=json.loads(body)['username']
    if proxy_state['block']==username:
     entered.set();release.wait(16);proxy_state['block']=None
    if proxy_state['drop']==username and status==200:
     # The real account exists, but its response never reaches the controller.
     # Revoke the real temporary token before discarding the response.
     token=json.loads(data).get('access_token')
     if token:request(matrix+'/_matrix/client/v3/logout',{},headers={'Authorization':'Bearer '+token})
     proxy_state['drop']=None;status=502;data=b'{"errcode":"M_UNKNOWN"}'
   if self.path=='/_matrix/client/v3/logout':proxy_state['logouts']+=1
   self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  except (OSError,TimeoutError):
   self.close_connection=True
  finally:conn.close()

key=''
def api(path,body=None,method=None,owner=True,headers=None):
 return request(base+'/api'+path,body,method,{'Origin':base,**({'Authorization':'Bearer '+key} if owner else {}),**(headers or {})})
def sql(query,args=()):
 with sqlite3.connect(org/'.state/platform.sqlite3',timeout=10) as db:
  result=db.execute(query,args).fetchall();db.commit();return result

def start(enabled=True,secret=None):
 global controller,controller_log,key
 env={k:v for k,v in os.environ.items() if not k.startswith('AE_')}
 env.update(AE_PUBLIC_URL=base,AE_MATRIX_HOMESERVER=f'http://127.0.0.1:{proxy_port}',AE_MATRIX_SERVER_NAME=server,AE_MATRIX_BOT_USERNAME='invitebridge',AE_MATRIX_BOT_PASSWORD=bot_password,AE_MATRIX_ONBOARDING='true' if enabled else 'false',AE_MATRIX_REGISTRATION_SECRET_FILE=str(secret or secret_file),CODEX_HOME=str(root/'empty-codex'),AE_ANTIGRAVITY=str(root/'absent-agy.exe'),AE_OPENCODE=str(root/'absent-opencode.exe'))
 controller_log=(root/'controller.log').open('a',encoding='utf-8')
 controller=subprocess.Popen([str(binary),'--org',str(org),'--port',str(port),'--bind','127.0.0.1','--frontend',str(repo/'src/frontend/dist'),'--codex',str(root/'absent-codex.exe')],cwd=root,env=env,stdout=controller_log,stderr=subprocess.STDOUT,**({'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}))
 health(base+'/api/health');key=(org/'.state/owner.key').read_text().strip()
 all_secrets.append(key)

def stop():
 global controller
 if controller and controller.poll() is None:controller.terminate();controller.wait(timeout=20)
 if controller_log:controller_log.close()
 controller=None

def register(username,password,admin=False):
 nonce=request(matrix+'/_synapse/admin/v1/register')[1]['nonce']
 mac=hmac.new(shared.encode(),b'\0'.join([nonce.encode(),username.encode(),password.encode(),b'admin' if admin else b'notadmin']),hashlib.sha1).hexdigest()
 code,v,_=request(matrix+'/_synapse/admin/v1/register',{'nonce':nonce,'username':username,'password':password,'admin':admin,'mac':mac})
 assert code==200,'Synapse fixture registration failed'
 return v

def create(tenant='default'):
 sql('DELETE FROM member_invitation_limits WHERE bucket LIKE ?',('create:%',))
 code,v,_=api(f'/tenants/{tenant}/invitations',{})
 assert code==200,('create invitation failed',code,v)
 token=urllib.parse.parse_qs(urllib.parse.urlsplit(v['link']).fragment)['invite'][0];all_secrets.append(token)
 return v,token

def accept(token,username,claim=None,password=None,**extra):
 claim=claim or secrets.token_hex(32);password=password or ('Strong-'+secrets.token_hex(16));all_secrets.extend([claim,password])
 return api('/invitations/accept',{'token':token,'claim':claim,'username':username,'password':password,**extra},owner=False),claim,password

bot_password='Bridge-'+secrets.token_hex(16);all_secrets.append(bot_password)
proxy=http.server.ThreadingHTTPServer(('127.0.0.1',proxy_port),Forward)
thread=threading.Thread(target=proxy.serve_forever,daemon=True);thread.start()
try:
 syn=root/'synapse';syn.mkdir()
 config={'server_name':server,'pid_file':'/data/homeserver.pid','listeners':[{'port':8008,'tls':False,'type':'http','x_forwarded':False,'resources':[{'names':['client'],'compress':False}]}],'database':{'name':'sqlite3','args':{'database':'/data/homeserver.db'}},'log_config':'/data/log.config','media_store_path':'/data/media','signing_key_path':'/data/signing.key','registration_shared_secret':shared,'enable_registration':False,'report_stats':False,'trusted_key_servers':[],'password_config':{'policy':{'enabled':True,'minimum_length':12}},'rc_login':{'address':{'per_second':1000,'burst_count':1000},'account':{'per_second':1000,'burst_count':1000},'failed_attempts':{'per_second':1000,'burst_count':1000}}}
 (syn/'homeserver.yaml').write_text(json.dumps(config))
 (syn/'log.config').write_text(json.dumps({'version':1,'handlers':{'console':{'class':'logging.StreamHandler'}},'root':{'level':'WARNING','handlers':['console']},'loggers':{'synapse.rest.admin.users.registration_debug':{'level':'CRITICAL'}}}))
 subprocess.run(['docker','run','-d','--name',name,'--cpus','0.5','--memory','512m','-p',f'127.0.0.1:{synapse_port}:8008','--mount',f'type=bind,source={syn},target=/data',image],check=True,capture_output=True)
 created_container=True
 health(matrix+'/_matrix/client/versions')
 admin=register('fixtureadmin','Admin-'+secrets.token_hex(16),True)
 register('invitebridge',bot_password)
 admin_headers={'Authorization':'Bearer '+admin['access_token']}
 def user_info(username):return request(matrix+'/_synapse/admin/v2/users/'+urllib.parse.quote('@'+username+':'+server,safe=''),headers=admin_headers)
 start()
 _,inv,_=api('/tenants/default/invitations')
 check('Explicit local Synapse provisioning readiness',inv['ready'])
 check('Anonymous cannot manage invitations',api('/tenants/default/invitations',owner=False)[0]==401)
 check('Owner creation rejects privilege/host options',api('/tenants/default/invitations',{'admin':True})[0]==400)
 prior=sql('SELECT count(*) FROM member_invitations')[0][0]
 check('GET/link preview cannot consume or create accounts',request(base+'/join')[0]==200 and api('/invitations/accept',owner=False)[0]==405 and sql('SELECT count(*) FROM member_invitations')[0][0]==prior)
 v,t=create()
 check('One-use link is fragment based and only its digest is persisted',len(t)==64 and not urllib.parse.urlsplit(v['link']).query and sql('SELECT token_hash FROM member_invitations WHERE id=?',(v['id'],))[0][0]==hashlib.sha256(t.encode()).hexdigest())
 check('No-origin invitation submission denied',request(base+'/api/invitations/inspect',{'token':t})[0]==403)
 for username in ['owner','admin','agentic','invitebridge','BAD','short@elsewhere']:
  check('Reserved/invalid username '+username,accept(t,username)[0][0]==422)
 check('Recipient cannot select role, server, admin or workspace',accept(t,'tampered',admin=True)[0][0]==400)
 result,claim,password=accept(t,'accepted.one')
 check('Real account plus fixed Member membership',result[0]==200 and sql('SELECT role FROM members WHERE user=?',('@accepted.one:'+server,))==[('member',)])
 check('Created Synapse account is non-admin',user_info('accepted.one')[1]['admin']==0)
 with sqlite3.connect(syn/'homeserver.db') as db:
  active_tokens=db.execute('SELECT count(*) FROM access_tokens WHERE user_id=?',('@accepted.one:'+server,)).fetchone()[0]
 check('Registration creates no retained temporary access token',active_tokens==0)
 count=proxy_state['registrations']
 check('Same-claim response replay returns acceptance without another registration',accept(t,'accepted.one',claim,password)[0][0]==200 and proxy_state['registrations']==count)
 check('Used invitation denies different claim',accept(t,'accepted.two')[0][0]==410)
 check('Used invitation inspect denies metadata',api('/invitations/inspect',{'token':t},owner=False)[0]==410)
 # Real login is the normal existing product route, not a synthetic platform session.
 status,me,headers=api('/login',{'username':'accepted.one','password':password},owner=False)
 check('New member signs in through unchanged Matrix login',status==200 and me['user']=='@accepted.one:'+server)
 cookie=headers['set-cookie'].split(';')[0]
 def member(path,body=None,method=None):return api(path,body,method,owner=False,headers={'Cookie':cookie})
 check('Member cannot list/create/revoke invitations',all(member('/tenants/default/invitations',**k)[0]==403 for k in [{},{'body':{}},{'method':'DELETE'}]))
 unrelated=api('/tenants',{'name':'Unrelated'})[1]['id']
 check('Unrelated workspace remains inaccessible',all(w['id']!=unrelated for w in member('/tenants')[1]))
 check('Explicit unrelated-workspace request denied',api('/state',owner=False,headers={'Cookie':cookie,'x-ae-workspace':unrelated})[0]==403)
 # Default general remains readable. Create a private room without sending any message.
 private_input=dict(api('/state')[1]['groups'][0]);private_input.update(id='private-owner',name='Private owner room',human_ids=[])
 code,private,_=api('/groups',private_input)
 assert code==200,(code,private)
 check('Private room is hidden from Member',not any(g['id']==private['id'] for g in member('/state')[1]['groups']))
 check('Private room message read denied',member('/groups/'+private['id']+'/messages')[0]==403)
 check('Member can open permitted default room',member('/groups/general/messages')[0]==200)
 old_name=me['user']
 check('Display name and owner key login unchanged',api('/login',{'token':key},owner=False)[0]==200 and api('/me')[1]['user']=='owner')
 # Existence alone never attaches an account; wrong credentials never change its password.
 v,t=create();check('Already reserved username has an actionable conflict',accept(t,'accepted.one')[0][0]==409)
 collision_password='Collision-'+secrets.token_hex(16);register('collision.existing',collision_password);v,t=create();n=proxy_state['registrations']
 check('Native Synapse username collision is rejected without membership or reset',accept(t,'collision.existing')[0][0]==409 and proxy_state['registrations']==n+1 and not sql('SELECT user FROM members WHERE user=?',('@collision.existing:'+server,)))
 check('Original existing-account password remains valid',request(matrix+'/_matrix/client/v3/login',{'type':'m.login.password','user':old_name,'password':password})[0]==200)
 check('Existing Matrix invite path remains available',api('/tenants/'+unrelated+'/members',{'user':old_name,'role':'member'})[0]==200)
 # Expiry, revocation, deleted tenant and issuer authority are actual stored transitions.
 for label,change in [('expired',"UPDATE member_invitations SET expires=unixepoch()-1 WHERE id=?"),('revoked',"UPDATE member_invitations SET status='revoked' WHERE id=?")]:
  v,t=create();sql(change,(v['id'],));n=proxy_state['registrations'];check(label+' invitation cannot provision',accept(t,'blocked.'+label)[0][0]==410 and proxy_state['registrations']==n)
 tenant=api('/tenants',{'name':'Deleted invite scope'})[1]['id'];v,t=create(tenant);api('/tenants/'+tenant,{},'DELETE');check('Deleted workspace denies creation',accept(t,'deleted.scope')[0][0]==410)
 tenant=api('/tenants',{'name':'Demoted issuer scope'})[1]['id'];v,t=create(tenant);sql("UPDATE members SET role='member' WHERE tenant=? AND user='owner'",(tenant,));check('Demoted issuer denies provisioning',accept(t,'demoted.scope')[0][0]==410)
 # Exclusive concurrent claim + revoke serialization against a genuine in-flight account.
 v,t=create();proxy_state['block']='concurrent.one';entered.clear();release.clear();claim=secrets.token_hex(32);pwd='Concurrent-'+secrets.token_hex(16)
 with concurrent.futures.ThreadPoolExecutor() as pool:
  pending=pool.submit(accept,t,'concurrent.one',claim,pwd)
  assert entered.wait(10)
  check('Concurrent same-claim submission is bounded',accept(t,'concurrent.one',claim,pwd)[0][0]==409)
  check('Different claim cannot take an in-flight invitation',accept(t,'concurrent.two')[0][0]==410)
  check('Revoke reports genuine in-progress phase',api('/tenants/default/invitations/'+v['id'],method='DELETE')[0]==409)
  release.set();check('Original in-flight claim completes once',pending.result()[0][0]==200)
 # Authority can change while upstream has already created a real account.
 tenant=api('/tenants',{'name':'Authority race'})[1]['id'];v,t=create(tenant)
 proxy_state['block']='authority.race';entered.clear();release.clear();claim=secrets.token_hex(32);pwd='Authority-'+secrets.token_hex(16)
 with concurrent.futures.ThreadPoolExecutor() as pool:
  pending=pool.submit(accept,t,'authority.race',claim,pwd);assert entered.wait(10)
  sql("UPDATE members SET role='member' WHERE tenant=? AND user='owner'",(tenant,));release.set()
  check('Authority loss after account creation denies membership truthfully',pending.result()[0][0]==503 and user_info('authority.race')[0]==200 and not sql('SELECT user FROM members WHERE tenant=? AND user=?',(tenant,'@authority.race:'+server)))
 # A bounded request timeout is an uncertain outcome, not permission to recreate.
 v,t=create();proxy_state['block']='timeout.claim';entered.clear();release.clear();claim=secrets.token_hex(32);pwd='Timeout-'+secrets.token_hex(16)
 with concurrent.futures.ThreadPoolExecutor() as pool:
  pending=pool.submit(accept,t,'timeout.claim',claim,pwd);assert entered.wait(10)
  check('Native upstream timeout retains unresolved claim',pending.result(timeout=20)[0][0]==502 and sql('SELECT status FROM member_invitations WHERE id=?',(v['id'],))[0][0]=='unresolved')
  release.set();time.sleep(0.3)
  check('Timed-out real account recovers through authentication',accept(t,'timeout.claim',claim,pwd)[0][0]==200)
 # Offline nonce path never starts registration and can safely retry.
 v,t=create();proxy_state['offline']=True;n=proxy_state['registrations']
 check('Interrupted Matrix service fails closed before registration',accept(t,'offline.claim')[0][0]==503 and proxy_state['registrations']==n)
 proxy_state['offline']=False
 # Controlled response loss is at Synapse HTTP boundary, with the real account already created.
 v,t=create();proxy_state['drop']='lost.response';(result,claim,pwd)=accept(t,'lost.response')
 check('Lost upstream creation response persists unresolved without membership',result[0]==502 and sql('SELECT status FROM member_invitations WHERE id=?',(v['id'],))[0][0]=='unresolved' and not sql('SELECT user FROM members WHERE user=?',('@lost.response:'+server,)))
 n=proxy_state['registrations'];check('Wrong reconciliation password cannot attach account',accept(t,'lost.response',claim,'Wrong-password-test')[0][0]==401)
 check('Exact-account authentication recovers without recreating',accept(t,'lost.response',claim,pwd)[0][0]==200 and proxy_state['registrations']==n)
 # Real membership DB failure after Synapse account creation; trigger removed only after observing phase.
 v,t=create();sql("CREATE TRIGGER fail_invite_membership BEFORE INSERT ON members WHEN NEW.user='@membership.failure:invite.test' BEGIN SELECT RAISE(ABORT,'fixture membership boundary interruption'); END")
 (result,claim,pwd)=accept(t,'membership.failure');check('Real DB membership failure preserves confirmed account and pending phase',result[0]==503 and user_info('membership.failure')[0]==200 and sql('SELECT status FROM member_invitations WHERE id=?',(v['id'],))[0][0]=='membership_pending')
 sql('DROP TRIGGER fail_invite_membership');n=proxy_state['registrations'];check('Pending membership resumes without account recreation',accept(t,'membership.failure',claim,pwd)[0][0]==200 and proxy_state['registrations']==n)
 # Restart recovers an abandoned lease; state and sessions stay intact.
 v,t=create();claim=secrets.token_hex(32);pwd='Restart-'+secrets.token_hex(16);register('restart.claim',pwd)
 sql("UPDATE member_invitations SET status='claiming',username='restart.claim',claim_hash=? WHERE id=?",(hashlib.sha256(claim.encode()).hexdigest(),v['id']))
 stop();start();check('Restart converts interrupted claim to unresolved',sql('SELECT status FROM member_invitations WHERE id=?',(v['id'],))[0][0]=='unresolved')
 check('Restart reconciliation proves real ownership',accept(t,'restart.claim',claim,pwd)[0][0]==200)
 # Exhaustion and readiness failure must not invalidate existing login/invite behavior.
 v,t=create();sql('UPDATE member_invitations SET attempts=10 WHERE id=?',(v['id'],));check('Exhausted invitation is rate limited',accept(t,'exhausted.claim')[0][0]==429)
 v,t=create();sql("UPDATE member_invitations SET username='partial.revoked',status='membership_pending',claim_hash=? WHERE id=?",(hashlib.sha256(secrets.token_hex(32).encode()).hexdigest(),v['id']))
 check('Revocation leaves honest partial-account notice',api('/tenants/default/invitations/'+v['id'],method='DELETE')[1]['status']=='revoked')
 # Known partial account + revocation must preserve the ordinary account without access.
 v,t=create();proxy_state['drop']='revoked.partial';(partial,claim,pwd)=accept(t,'revoked.partial');assert partial[0]==502
 api('/tenants/default/invitations/'+v['id'],method='DELETE')
 check('Revoked unresolved account remains but cannot gain membership',accept(t,'revoked.partial',claim,pwd)[0][0]==410 and user_info('revoked.partial')[0]==200 and not sql('SELECT user FROM members WHERE user=?',('@revoked.partial:'+server,)))
 stop();start(False)
 check('Disabled onboarding fails closed',not api('/tenants/default/invitations')[1]['ready'] and api('/tenants/default/invitations',{})[0]==503)
 check('Existing Matrix login still works with onboarding disabled',api('/login',{'username':'accepted.one','password':password},owner=False)[0]==200)
 check('Existing-member invitation unaffected by disabled provisioning',api('/tenants/default/members',{'user':old_name,'role':'member'})[0]==200)
 stop();start(secret=root/'missing.secret')
 check('Missing secret file fails closed',not api('/tenants/default/invitations')[1]['ready'])
 invalid_file=root/'short.secret';invalid_file.write_text('too-short');stop();start(secret=invalid_file)
 check('Invalid secret configuration fails closed',not api('/tenants/default/invitations')[1]['ready'])
 stop();start()
 # Creation burst and pending cap are exercised on a separate disposable workspace.
 limited=api('/tenants',{'name':'Limits fixture'})[1]['id']
 sql('DELETE FROM member_invitation_limits WHERE bucket LIKE ?',('create:%',))
 for _ in range(5):assert api('/tenants/'+limited+'/invitations',{})[0]==200
 check('Owner invitation creation is rate limited',api('/tenants/'+limited+'/invitations',{})[0]==429)
 sql('DELETE FROM member_invitation_limits WHERE bucket LIKE ?',('create:%',))
 with sqlite3.connect(org/'.state/platform.sqlite3') as db:
  for _ in range(45):
   db.execute('INSERT INTO member_invitations(id,token_hash,tenant,issuer) VALUES(?,?,?,?)',(secrets.token_hex(16),hashlib.sha256(secrets.token_bytes(32)).hexdigest(),limited,'owner'))
  db.commit()
 check('Pending invitation cap is enforced by real owner endpoint',api('/tenants/'+limited+'/invitations',{})[0]==429)
 check('Audit preserves lifecycle phases without raw credential fields',{'created','claiming','account_confirmed','accepted','unresolved','revoked'} <= {row[0] for row in sql('SELECT DISTINCT phase FROM member_invitation_audit')})
 # Browser suite receives only disposable fixture account credentials in process environment.
 env=os.environ.copy();env.update(AE_TEST_URL=base,AE_TEST_ORG=str(org),AE_TEST_OUTPUT=str(root),AE_TEST_MATRIX_USER=old_name,AE_TEST_MATRIX_PASSWORD=password)
 subprocess.run(['node',str(repo/'src/frontend/tests/matrix-member-onboarding.mjs')],cwd=repo/'src',env=env,check=True)
 for store in org.rglob('app.sqlite3'):
  with sqlite3.connect(store) as db:
   for table in ['runs','terminal_runs','fleet_jobs']:
    assert db.execute('SELECT count(*) FROM '+table).fetchone()[0]==0,'Unexpected task in disposable fixture'
 check('No worker, terminal or provider task in any workspace database',not api('/state')[1]['runs'])
 # Credentials must never appear in the platform database or application log.
 stop()
 database=b''.join(p.read_bytes() for p in (org/'.state').glob('platform.sqlite3*'))
 log=(root/'controller.log').read_bytes()
 for secret in all_secrets:
  assert secret.encode() not in database and secret.encode() not in log,'Credential found in platform persistence/log'
 check('No raw invitation/password/secret in platform DB or log')
 (root/'receipt.json').write_text(json.dumps({'checks':checks,'real_dependencies':['native controller','Synapse v1.161.0','SQLite','Chrome two contexts'],'boundary_interruption':'Loopback forwarding proxy discards one genuine registration response; actual SQLite trigger blocks one membership insert. No account creation is mocked.','agent_tasks':0,'production_accessed':False},indent=2))
 print(f'{len(checks)} real local API/Matrix checks passed',flush=True)
finally:
 release.set();stop();proxy.shutdown();proxy.server_close()
 if created_container:subprocess.run(['docker','rm','-f',name],capture_output=True)

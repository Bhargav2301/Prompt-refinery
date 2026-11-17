export async function runCommunityUi(page, { baseUrl = 'http://localhost:9002', outputDirectory = 'tmp' } = {}) {
  await (await import('node:fs/promises')).mkdir(outputDirectory, { recursive: true });
  await page.unrouteAll({ behavior: 'wait' });
  const threads = new Map(); const notes = [{id:'release-0.2.0',kind:'release',version:'0.2.0',title:'Learn prompting and stay in touch',body:'Synthetic release note',createdAt:'2026-11-17T00:00:00.000Z',read:false}];
  let failOnce = true; const attempts = [];
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const method = req.method();
    const data = method === 'GET' ? null : req.postDataJSON();
    const send = (json, status = 200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
    if(path === '/api/notifications') {
      if(method === 'POST') for(const note of notes) if(data.ids.includes(note.id)) note.read = true;
      return send(method === 'POST' ? {ok:true} : {items:notes,nextCursor:null,unread:notes.filter(n=>!n.read).length,currentVersion:'0.2.0'});
    }
    if(!/^\/api\/(admin\/)?feedback(\/[^/]+)?$/.test(path)) return send({error:{message:'Unmocked fixture endpoint'}},500);
    const owner = path.includes('/admin/'); const id = path.split('/')[owner ? 4 : 3];
    if(!id && method === 'GET') return send({items:[...threads.values()],nextCursor:null});
    if(!id && method === 'POST') {
      attempts.push(data.id);
      if(failOnce) { failOnce=false; return send({error:{message:'Synthetic network interruption. Retry your draft.'}},503); }
      const now=new Date().toISOString();
      const thread={id:data.id,category:data.category,subject:data.subject,status:'open',createdAt:now,updatedAt:now,lastAuthor:'user',messages:[{id:data.id,author:'user',text:data.message,createdAt:now}]}; threads.set(data.id,thread); return send(thread);
    }
    const thread=threads.get(id); if(!thread) return send({error:{message:'Conversation not found.'}},404);
    if(method === 'GET') return send(thread);
    if(method === 'PATCH') { thread.status=data.status; return send(thread); }
    if(method === 'POST') {
      const now=new Date().toISOString(); thread.messages.push({id:data.id,author:owner?'owner':'user',text:data.message,createdAt:now});thread.lastAuthor=owner?'owner':'user';thread.updatedAt=now;thread.status='open';
      if(owner)notes.push({id:data.id,kind:'reply',title:'Clarift replied: '+thread.subject,body:data.message,threadId:thread.id,createdAt:now,read:false});
      return send(thread);
    }
    return send({},405);
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto(baseUrl + '/community-preview',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'New feedback',exact:true}).click();
  await page.getByLabel('Type',{exact:true}).selectOption('complaint');
  await page.getByLabel('Subject',{exact:true}).fill('Synthetic mobile issue');
  await page.getByLabel('What would you like to share?',{exact:true}).fill('Synthetic description <script>alert("not executed")</script>');
  await page.getByRole('button',{name:'Send feedback',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Synthetic network interruption'}).waitFor();
  if(!(await page.getByLabel('What would you like to share?',{exact:true}).inputValue()).includes('Synthetic description')) throw new Error('Draft lost after failure');
  await page.getByRole('button',{name:'Send feedback',exact:true}).click();
  await page.getByRole('heading',{name:'Synthetic mobile issue',exact:true}).waitFor();
  if(attempts.length!==2 || attempts[0]!==attempts[1]) throw new Error('Retry was not idempotent');
  await page.getByRole('button',{name:'Switch to owner',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Synthetic mobile issue'}).click();
  await page.getByLabel('Reply',{exact:true}).fill('Synthetic owner reply: thank you for the report.');
  await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.getByRole('list',{name:'Conversation messages'}).getByText('Synthetic owner reply: thank you for the report.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Mark resolved',exact:true}).click();
  await page.getByRole('button',{name:'Reopen',exact:true}).waitFor();
  await page.screenshot({path:outputDirectory + '/community-owner-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Switch to user',exact:true}).click();
  await page.getByRole('button',{name:/Notifications,/}).click();
  await page.getByRole('button',{name:'Open conversation',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open conversation',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByText('Synthetic owner reply: thank you for the report.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  if(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth)) throw new Error('Feedback dialog mobile overflow');
  await page.screenshot({path:outputDirectory + '/community-feedback-mobile.png',fullPage:true});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:/Notifications,/}).click();
  await page.getByRole('button',{name:'Mark displayed as read',exact:true}).click();
  await page.getByText('0 unread',{exact:true}).waitFor();
  if(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)) throw new Error('Notifications mobile overflow');
  await page.screenshot({path:outputDirectory + '/community-notifications-mobile.png',fullPage:true});
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Notifications, 0 unread',exact:true}).waitFor();
  await page.getByRole('button').filter({hasText:'Synthetic mobile issue'}).click();
  await page.getByLabel('Reply',{exact:true}).fill('Synthetic user follow-up.');
  await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.getByRole('list',{name:'Conversation messages'}).getByText('Synthetic user follow-up.',{exact:true}).waitFor();
  if([...threads.values()][0].status!=='open') throw new Error('Follow-up did not reopen');
  await page.goto('about:blank');
  await page.unrouteAll({behavior:'wait'});
  return {feedback:true,retryPreservesIdAndDraft:true,ownerReply:true,resolution:true,notificationDeepLink:true,readReceiptsSurviveReload:true,userFollowup:true,mobileOverflow:false};
}

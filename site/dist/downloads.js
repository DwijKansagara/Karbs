"use strict";
async function loadRelease(){
 const status=document.getElementById('release-status'),button=document.getElementById('windows-download'),detail=document.getElementById('windows-detail');
 try{
  const response=await fetch('https://api.github.com/repos/DwijKansagara/Karbs/releases/latest',{signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json'}});
  if(response.status===404){status.textContent='The first Windows installer is being prepared. No published download is available yet.';detail.textContent='View release progress and source on GitHub.';return;}
  if(!response.ok)throw new Error('Release information unavailable');
  const release=await response.json();if(release.draft||release.prerelease)throw new Error('Not a stable release');
  const asset=release.assets.find(a=>/^Karbs_[\d.]+_x64-setup\.exe$/.test(a.name)&&a.state==='uploaded'&&a.size>0&&a.browser_download_url.startsWith('https://github.com/DwijKansagara/Karbs/releases/download/'));
  if(!asset){status.textContent='No Windows installer is attached to the latest published release.';return;}
  button.href=asset.browser_download_url;button.textContent='Download Windows';
  detail.textContent=`${release.tag_name} · ${(asset.size/1048576).toFixed(1)} MB · Windows x64`;
  status.textContent=`${release.tag_name} is available. The button downloads the Windows installer directly from GitHub.`;
 }catch{status.textContent='Release information could not be loaded. Check the GitHub releases page for available downloads.';detail.textContent='Check GitHub for the latest installer.';}
}
loadRelease();
async function loadPreviews(){
 const status=document.getElementById('preview-status');const tag='ports-v0.3.0-preview.1';
 const options={'mac-arm-download':'Karbs_0.3.0_macOS_arm64.dmg','mac-x64-download':'Karbs_0.3.0_macOS_x64.dmg','linux-deb-download':'Karbs_0.3.0_Linux_x64.deb','linux-appimage-download':'Karbs_0.3.0_Linux_x64.AppImage','android-download':'Karbs_0.3.0_android.apk'};
 try{
  const response=await fetch('https://api.github.com/repos/DwijKansagara/Karbs/releases/tags/'+tag,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw new Error('Preview unavailable');const release=await response.json();if(release.draft||!release.prerelease||release.tag_name!==tag)throw new Error('Unexpected preview release');
  for(const[id,name]of Object.entries(options)){const asset=release.assets.find(a=>a.name===name&&a.state==='uploaded'&&a.size>0&&a.browser_download_url==='https://github.com/DwijKansagara/Karbs/releases/download/'+tag+'/'+name);if(!asset)throw new Error('Missing platform artifact');}
  for(const[id,name]of Object.entries(options)){const button=document.getElementById(id);button.href=release.assets.find(a=>a.name===name).browser_download_url;button.hidden=false;}
  status.textContent='Native preview 0.3.0: macOS, Linux and Android downloads are available. Read the platform limitations before installing.';
 }catch{status.textContent='Native preview downloads are not available here yet. Check GitHub releases for verified builds.';for(const id of Object.keys(options)){const button=document.getElementById(id);button.hidden=true;button.removeAttribute('href');}}
}
loadPreviews();

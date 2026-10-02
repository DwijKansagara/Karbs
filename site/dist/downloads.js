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

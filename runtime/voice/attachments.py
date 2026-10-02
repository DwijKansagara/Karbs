"""Prepare PDF pages and GIF frames for Codex's image input; originals stay intact."""
import sys, os, json, uuid
from pathlib import Path
sys.path.insert(0, str(Path(os.environ['COUCOU_DATA_DIR']) / 'voice/site'))
from PIL import Image
source = Path(sys.argv[1])
destination = Path(os.environ['COUCOU_DATA_DIR']) / 'chat-workspace/attachments' / str(uuid.uuid4())
try:
    if source.stat().st_size > 8_000_000: raise ValueError('Attachments must be under 8 MB.')
    destination.mkdir(parents=True, exist_ok=True)
    images = []; text = ''
    if source.suffix.lower() == '.pdf':
        from pypdf import PdfReader
        import pypdfium2 as pdfium
        reader = PdfReader(source)
        if reader.is_encrypted and not reader.decrypt(''): raise ValueError('This PDF is password protected. Use an unlocked copy.')
        count = len(reader.pages)
        for index, page in enumerate(reader.pages[:100]):
            text += f'\nPage {index+1}:\n{page.extract_text() or ""}'
            if len(text) > 100000: text = text[:100000]; break
        document = pdfium.PdfDocument(str(source))
        for index in range(min(count,8)):
            page = document[index]
            bitmap = page.render(scale=min(2.0,1400/max(page.get_size())))
            image = bitmap.to_pil()
            path = destination / f'page-{index+1}.png'; image.save(path); images.append(str(path))
            image.close(); bitmap.close(); page.close()
        document.close()
        text = f'PDF has {count} pages. Reference text covers up to the first 100 pages / 100000 characters. Attached images show the first {len(images)} pages. Do not claim to have inspected other pages. Original PDF: {source}\n'+text
    elif source.suffix.lower() == '.gif':
        with Image.open(source) as animation:
            if animation.width*animation.height > 40_000_000: raise ValueError('GIF dimensions are too large.')
            count = getattr(animation,'n_frames',1)
            indices = sorted(set(round(i*(count-1)/max(1,min(8,count)-1)) for i in range(min(8,count))))
            for index in indices:
                animation.seek(index); frame=animation.convert('RGB'); frame.thumbnail((1400,1400))
                path=destination/f'frame-{index+1}.png'; frame.save(path); images.append(str(path));frame.close()
        text=f'GIF has {count} frames. The supplied images sample frames {[i+1 for i in indices]} in timeline order. This is sampled animation, not continuous video. Original GIF: {source}'
    else: raise ValueError('Only PDF and GIF conversion is supported.')
    print(json.dumps({'text':text,'images':images}))
except Exception as error:
    print(json.dumps({'error':str(error)}));sys.exit(1)

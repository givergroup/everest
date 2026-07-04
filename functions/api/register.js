export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    
    const username = payload.username || '';
    const name_th = payload.name_th || '';
    const name_en = payload.name_en || '';
    const phone = payload.phone || '';
    const line_url = payload.line_url || '';
    const register_link = payload.register_link || '';
    const image_ext = payload.image_ext || 'jpg';
    const image_data = payload.image_data || null;

    const GITHUB_TOKEN = env.GITHUB_TOKEN; 
    const REPO_OWNER = 'givergroup';
    const REPO_NAME = 'everest';
    
    // 💡 [แก้ไขจุดที่ 1] เปลี่ยนพาธเซฟไฟล์แยกตาม username ของแต่ละคน
    const MEMBER_FILE_PATH = `data/members/${username}.json`;
    const IMAGE_FILE_PATH = `en/images/${username}.${image_ext}`;

    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ message: "ระบบยังไม่ได้ตั้งค่า GitHub Token" }), { 
        status: 500, headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 💡 [แก้ไขจุดที่ 2] เช็คว่ามีไฟล์ username นี้อยู่บน GitHub หรือยัง (ป้องกันการสมัครชื่อซ้ำ)
    const checkUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MEMBER_FILE_PATH}`;
    const checkRes = await fetch(checkUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    // ถ้าเจอไฟล์เดิม (สถานะ 200) แปลว่า Username นี้ถูกใช้ไปแล้ว
    if (checkRes.ok) {
      return new Response(JSON.stringify({ message: 'Username นี้ถูกใช้ไปแล้ว กรุณาเปลี่ยนชื่ออื่น' }), { 
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    // --- ส่วนที่ 2: บันทึกไฟล์รูปภาพขึ้น GitHub (คงเดิม) ---
    if (image_data && typeof image_data === 'string') {
      try {
        let cleanImageData = image_data;
        if (image_data.includes(',')) {
          cleanImageData = image_data.split(',')[1];
        }
        
        const imageUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${IMAGE_FILE_PATH}`;
        await fetch(imageUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'User-Agent': 'Cloudflare-Pages-Function',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `📸 บอทระบบ: อัปโหลดรูปภาพโปรไฟล์ของคุณ ${name_en} (${username})`,
            content: cleanImageData 
          })
        });
      } catch (imgError) {
        console.error("Image upload failed but continuing:", imgError);
      }
    }

    // 💡 [แก้ไขจุดที่ 3] เตรียมโครงสร้างข้อมูลของสมาชิกคนนี้คนเดียว (ไม่ต้องไปดึงของคนอื่นมาปน)
    const newMemberData = {
      username,
      name_th,
      name_en,
      phone,
      line_url,
      register_link,
      image_url: `/en/images/${username}.${image_ext}` 
    };

    // เข้ารหัสแปลงข้อความกลับเป็น Base64
    const jsonString = JSON.stringify(newMemberData, null, 2);
    const utf8Bytes = new TextEncoder().encode(jsonString);
    let binaryStr = "";
    for (let i = 0; i < utf8Bytes.length; i++) {
      binaryStr += String.fromCharCode(utf8Bytes[i]);
    }
    const base64JsonContent = btoa(binaryStr);

    // 💡 [แก้ไขจุดที่ 4] ยิง API ไปสร้างไฟล์ใหม่แยกชิ้น (ไม่ต้องใส่ค่า sha เพราะเป็นการสร้างไฟล์ใหม่แกะกล่อง)
    const createJsonRes = await fetch(checkUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `🤖 บอทระบบ: สร้างไฟล์รายชื่อสมาชิกใหม่คุณ ${name_en} (${username})`,
        content: base64JsonContent
        // ลบ sha ออก เพราะเราสร้างไฟล์ใหม่แยกชิ้น
      })
    });

    if (!createJsonRes.ok) {
      return new Response(JSON.stringify({ message: "สร้างระบบเว็บไซต์ส่วนตัวไม่สำเร็จ" }), { 
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 💡 [แก้ไขจุดที่ 5] ส่ง URL รูปแบบ Query String กลับตามที่คุณเลือก
    return new Response(JSON.stringify({
      message: 'ลงทะเบียนสำเร็จ',
      web_url: `https://everest191.com/en/?ref=${username}`
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ message: 'เกิดข้อผิดพลาดรุนแรงที่ระบบหลังบ้าน: ' + error.message }), { 
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

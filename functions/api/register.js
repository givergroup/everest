export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. รับข้อมูลชุดใหม่จากหน้าฟอร์ม
    const { username, name_th, name_en, phone, line_url, register_link, image_ext, image_data } = await request.json();

    const GITHUB_TOKEN = env.GITHUB_TOKEN; 
    const REPO_OWNER = 'givergroup';
    const REPO_NAME = 'everest';
    const JSON_FILE_PATH = 'data/members.json';
    
    const IMAGE_FILE_PATH = `en/images/${username}.${image_ext}`;

    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ message: "ระบบยังไม่ได้ตั้งค่า GitHub Token ใน Cloudflare Environment" }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // --- ส่วนที่ 1: ดึงไฟล์ JSON ปัจจุบัน ---
    const jsonUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${JSON_FILE_PATH}`;
    const jsonRes = await fetch(jsonUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!jsonRes.ok) {
      return new Response(JSON.stringify({ message: "ไม่สามารถเชื่อมต่อฐานข้อมูลรายชื่อบน GitHub ได้" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const jsonContentData = await jsonRes.json();
    const jsonSha = jsonContentData.sha; 
    
    // ถอดรหัส Base64 รองรับภาษาไทย UTF-8 (ขาเข้า)
    const base64Content = jsonContentData.content.replace(/\n/g, '');
    const binaryString = atob(base64Content);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const fileContent = new TextDecoder('utf-8').decode(bytes);
    const membersData = JSON.parse(fileContent);

    // ตรวจสอบ Username ซ้ำ
    if (membersData[username]) {
      return new Response(JSON.stringify({ message: 'Username นี้ถูกใช้ไปแล้ว กรุณาเปลี่ยนชื่ออื่น' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // ตรวจสอบเบอร์โทรศัพท์ซ้ำ
    const isPhoneDuplicate = Object.values(membersData).some(member => member.phone === phone);
    if (isPhoneDuplicate) {
      return new Response(JSON.stringify({ message: 'เบอร์โทรศัพท์นี้เคยลงทะเบียนในระบบแล้ว' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // --- ส่วนที่ 2: บันทึกไฟล์รูปภาพขึ้น GitHub ---
    if (image_data) {
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
          content: image_data 
        })
      });
    }

    // --- ส่วนที่ 3: บันทึกข้อมูลสมาชิกใหม่ต่อท้ายลงในข้อมูลเดิม ---
    membersData[username] = {
      name_th,
      name_en,
      phone,
      line_url,
      register_link,
      image_url: `/en/images/${username}.${image_ext}` 
    };

    //  แก้ไขจุดนี้: ใช้การแปลง Base64 แบบวนลูปดั้งเดิมที่ปลอดภัยที่สุด ไม่ใช้ .apply หรือชุดคำสั่งยุ่งยาก ป้องกันบั๊กรันไทม์พังเด็ดขาด
    const updatedJsonString = JSON.stringify(membersData, null, 2);
    const utf8BytesData = new TextEncoder().encode(updatedJsonString);
    let binaryStr = '';
    for (let i = 0; i < utf8BytesData.length; i++) {
        binaryStr += String.fromCharCode(utf8BytesData[i]);
    }
    const base64JsonContent = btoa(binaryStr);

    // ยิง API กลับไปเขียนทับไฟล์เดิมบน GitHub
    const updateJsonRes = await fetch(jsonUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'Cloudflare-Pages-Function',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `🤖 บอทระบบ: เพิ่มรายชื่อสมาชิกใหม่คุณ ${name_en} (${username})`,
        content: base64JsonContent,
        sha: jsonSha
      })
    });

    if (!updateJsonRes.ok) {
      return new Response(JSON.stringify({ message: "อัปเดตข้อมูลรายชื่อในสมาชิกไม่สำเร็จ" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      message: 'ลงทะเบียนสำเร็จ',
      web_url: `https://everest191.com/?ref=${username}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ message: 'เกิดข้อผิดพลาดรุนแรงที่ระบบหลังบ้าน: ' + error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

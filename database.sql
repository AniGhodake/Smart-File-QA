create table file_qa(
    id int auto_increment primary key,
    file_path varchar(250),
    email varchar(100),
    question text,
    answer text,
    timestamp datetime
);
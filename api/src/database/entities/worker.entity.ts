import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import {Job} from './job.entity'

@Entity('workers')
export class Worker {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({length: 255})
    name: string

    @Column({default: true})
    isActive: boolean

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date;

    //Relations
    @OneToMany(()=> Job, job => job.worker)
    jobs: Job[]
}